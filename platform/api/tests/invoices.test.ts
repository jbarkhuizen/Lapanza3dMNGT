import { test, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildApp } from '../src/app.js';
import { resetTestDatabase } from './helpers/testApp.js';
import { prisma } from '../src/db/client.js';
import { mailer } from '../src/lib/mailer.js';

beforeEach(resetTestDatabase);

async function loggedInAgent(app: ReturnType<typeof buildApp>, email = 'jane@acmeprints.co.za') {
  await request(app).post('/api/auth/register').send({
    businessName: 'Acme Prints',
    contactName: 'Jane Doe',
    email,
    password: 'correct horse battery staple',
  });
  const tenant = await prisma.tenant.findUnique({ where: { email } });
  await request(app).post('/api/auth/verify-email').send({ token: tenant?.verificationToken });

  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email, password: 'correct horse battery staple' });

  const plan = await prisma.plan.findFirstOrThrow({ where: { name: 'Tier 1' } });
  await prisma.subscription.create({
    data: {
      tenantId: tenant!.id,
      planId: plan.id,
      status: 'active',
      paymentProvider: 'payfast',
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
  });

  return agent;
}

async function makeCustomer(agent: ReturnType<typeof request.agent>) {
  const res = await agent.post('/api/customers').send({ name: 'Bob Client', billingAddress: '5 Oak St' });
  return res.body.customer.id as string;
}

test('invoice endpoints require auth', async () => {
  const app = buildApp();
  const res = await request(app).get('/api/invoices');
  assert.equal(res.status, 401);
});

test('POST /api/invoices creates a standalone invoice, numbered INV-0001, due in 30 days by default', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const customerId = await makeCustomer(agent);

  const res = await agent.post('/api/invoices').send({
    customerId,
    lineItems: [{ description: 'Custom bracket', unitPrice: 200, quantity: 1 }],
  });

  assert.equal(res.status, 201);
  assert.equal(res.body.invoice.number, 'INV-0001');
  assert.equal(res.body.invoice.status, 'unpaid');
  assert.equal(res.body.invoice.total, '200.00');
  assert.equal(res.body.invoice.amountPaid, '0.00');
  assert.equal(res.body.invoice.balanceDue, '200.00');
  assert.ok(res.body.invoice.dueDate);
});

test('POST /api/invoices with discountAppliesTo "total" persists discountPercent/discountAppliesTo/discountAmount and discounts before VAT', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  await agent.patch('/api/company-profile').send({ vatRegistered: true, vatNumber: '4123456789' });
  const customerId = await makeCustomer(agent);

  const res = await agent.post('/api/invoices').send({
    customerId,
    discountPercent: 10,
    discountAppliesTo: 'total',
    lineItems: [
      { description: 'Part A', unitPrice: 50, quantity: 3 }, // 150.00
      { description: 'Part B', unitPrice: 33, quantity: 1 }, // 33.00
    ],
  });

  assert.equal(res.status, 201);
  assert.equal(res.body.invoice.subtotal, '183.00');
  assert.equal(res.body.invoice.discountPercent, '10.00');
  assert.equal(res.body.invoice.discountAppliesTo, 'total');
  assert.equal(res.body.invoice.discountAmount, '18.30');
  assert.equal(res.body.invoice.vatAmount, '24.71');
  assert.equal(res.body.invoice.total, '189.41');
  assert.equal(res.body.invoice.lineItems[0].lineTotal, '150.00');
  assert.equal(res.body.invoice.lineItems[1].lineTotal, '33.00');
});

test('POST /api/invoices with discountAppliesTo "per_line" discounts each persisted line total before summing', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  await agent.patch('/api/company-profile').send({ vatRegistered: true, vatNumber: '4123456789' });
  const customerId = await makeCustomer(agent);

  const res = await agent.post('/api/invoices').send({
    customerId,
    discountPercent: 10,
    discountAppliesTo: 'per_line',
    lineItems: [
      { description: 'Part A', unitPrice: 50, quantity: 3 }, // 150.00
      { description: 'Part B', unitPrice: 33, quantity: 1 }, // 33.00
    ],
  });

  assert.equal(res.status, 201);
  assert.equal(res.body.invoice.subtotal, '183.00');
  assert.equal(res.body.invoice.lineItems[0].lineTotal, '135.00');
  assert.equal(res.body.invoice.lineItems[1].lineTotal, '29.70');
  assert.equal(res.body.invoice.discountAmount, '18.30');
  assert.equal(res.body.invoice.total, '189.41');
});

test('POST /api/invoices without discount fields persists discountAmount 0.00 and null discountPercent/discountAppliesTo', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const customerId = await makeCustomer(agent);

  const res = await agent.post('/api/invoices').send({
    customerId,
    lineItems: [{ description: 'Custom bracket', unitPrice: 150, quantity: 2 }],
  });

  assert.equal(res.status, 201);
  assert.equal(res.body.invoice.discountPercent, null);
  assert.equal(res.body.invoice.discountAppliesTo, null);
  assert.equal(res.body.invoice.discountAmount, '0.00');
});

test('POST /api/invoices accepts a paymentLinkUrl and persists it, and rejects a malformed one', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const customerId = await makeCustomer(agent);

  const good = await agent.post('/api/invoices').send({
    customerId,
    paymentLinkUrl: 'https://pay.example.com/abc123',
    lineItems: [{ description: 'Part', unitPrice: 10, quantity: 1 }],
  });
  assert.equal(good.status, 201);
  assert.equal(good.body.invoice.paymentLinkUrl, 'https://pay.example.com/abc123');

  const bad = await agent.post('/api/invoices').send({
    customerId,
    paymentLinkUrl: 'not-a-url',
    lineItems: [{ description: 'Part', unitPrice: 10, quantity: 1 }],
  });
  assert.equal(bad.status, 400);

  const blank = await agent.post('/api/invoices').send({
    customerId,
    paymentLinkUrl: '',
    lineItems: [{ description: 'Part', unitPrice: 10, quantity: 1 }],
  });
  assert.equal(blank.status, 201);
  assert.equal(blank.body.invoice.paymentLinkUrl, null);
});

test('POST /api/invoices defaults paymentTerms/termsAndConditionsText/notes from the tenant profile only when the request supplies none', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  await agent.patch('/api/company-profile').send({
    defaultPaymentTerms: '50% deposit, balance on delivery.',
    defaultNotes: 'Standard tenant note.',
    termsAndConditionsText: 'Standard tenant T&Cs.',
  });
  const customerId = await makeCustomer(agent);

  const usesDefaults = await agent.post('/api/invoices').send({
    customerId,
    lineItems: [{ description: 'Part', unitPrice: 10, quantity: 1 }],
  });
  assert.equal(usesDefaults.status, 201);
  assert.equal(usesDefaults.body.invoice.paymentTerms, '50% deposit, balance on delivery.');
  assert.equal(usesDefaults.body.invoice.notes, 'Standard tenant note.');
  assert.equal(usesDefaults.body.invoice.termsAndConditionsText, 'Standard tenant T&Cs.');

  // Editing the tenant default afterward must not retroactively change the already-created invoice.
  await agent.patch('/api/company-profile').send({ defaultPaymentTerms: 'Changed default.' });
  const reFetched = await agent.get(`/api/invoices/${usesDefaults.body.invoice.id}`);
  assert.equal(reFetched.body.invoice.paymentTerms, '50% deposit, balance on delivery.');
});

test('PATCH /api/invoices/:id edits notes/paymentTerms/termsAndConditionsText/paymentLinkUrl on an already-created invoice', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const customerId = await makeCustomer(agent);
  const created = await agent.post('/api/invoices').send({
    customerId,
    lineItems: [{ description: 'Part', unitPrice: 10, quantity: 1 }],
  });
  const invoiceId = created.body.invoice.id as string;

  const res = await agent.patch(`/api/invoices/${invoiceId}`).send({
    notes: 'Updated notes.',
    paymentTerms: 'Net 15.',
    termsAndConditionsText: 'Updated terms.',
    paymentLinkUrl: 'https://pay.example.com/xyz',
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.invoice.notes, 'Updated notes.');
  assert.equal(res.body.invoice.paymentTerms, 'Net 15.');
  assert.equal(res.body.invoice.termsAndConditionsText, 'Updated terms.');
  assert.equal(res.body.invoice.paymentLinkUrl, 'https://pay.example.com/xyz');
});

test('PATCH /api/invoices/:id rejects a malformed paymentLinkUrl', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const customerId = await makeCustomer(agent);
  const created = await agent.post('/api/invoices').send({
    customerId,
    lineItems: [{ description: 'Part', unitPrice: 10, quantity: 1 }],
  });
  const invoiceId = created.body.invoice.id as string;

  const res = await agent.patch(`/api/invoices/${invoiceId}`).send({ paymentLinkUrl: 'not-a-url' });
  assert.equal(res.status, 400);
});

test('PATCH /api/invoices/:id returns 404 for an invoice belonging to another tenant', async () => {
  const app = buildApp();
  const agentA = await loggedInAgent(app, 'jane@acmeprints.co.za');
  const customerId = await makeCustomer(agentA);
  const created = await agentA.post('/api/invoices').send({
    customerId,
    lineItems: [{ description: 'Part', unitPrice: 10, quantity: 1 }],
  });

  const agentB = await loggedInAgent(app, 'sam@othershop.co.za');
  const res = await agentB.patch(`/api/invoices/${created.body.invoice.id}`).send({ notes: 'nope' });
  assert.equal(res.status, 404);
});

test('balanceDue reflects total minus amountPaid at every payment status, computed server-side', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const customerId = await makeCustomer(agent);
  const created = await agent.post('/api/invoices').send({
    customerId,
    lineItems: [{ description: 'Part', unitPrice: 100, quantity: 1 }],
  });
  const invoiceId = created.body.invoice.id as string;
  assert.equal(created.body.invoice.balanceDue, '100.00');

  const partial = await agent.patch(`/api/invoices/${invoiceId}/status`).send({ status: 'partially_paid', amountPaid: 40 });
  assert.equal(partial.body.invoice.balanceDue, '60.00');

  const paid = await agent.patch(`/api/invoices/${invoiceId}/status`).send({ status: 'paid', amountPaid: 100 });
  assert.equal(paid.body.invoice.balanceDue, '0.00');
});

test('PATCH /api/invoices/:id/status requires amountPaid to equal total for paid', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const customerId = await makeCustomer(agent);
  const created = await agent.post('/api/invoices').send({
    customerId,
    lineItems: [{ description: 'Part', unitPrice: 100, quantity: 1 }],
  });
  const invoiceId = created.body.invoice.id as string;

  const wrongAmount = await agent.patch(`/api/invoices/${invoiceId}/status`).send({ status: 'paid', amountPaid: 50 });
  assert.equal(wrongAmount.status, 400);

  const correct = await agent.patch(`/api/invoices/${invoiceId}/status`).send({ status: 'paid', amountPaid: 100 });
  assert.equal(correct.status, 200);
  assert.equal(correct.body.invoice.status, 'paid');
  assert.equal(correct.body.invoice.amountPaid, '100.00');
});

test('PATCH /api/invoices/:id/status accepts a valid partial payment', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const customerId = await makeCustomer(agent);
  const created = await agent.post('/api/invoices').send({
    customerId,
    lineItems: [{ description: 'Part', unitPrice: 100, quantity: 1 }],
  });
  const invoiceId = created.body.invoice.id as string;

  const res = await agent.patch(`/api/invoices/${invoiceId}/status`).send({ status: 'partially_paid', amountPaid: 40 });
  assert.equal(res.status, 200);
  assert.equal(res.body.invoice.status, 'partially_paid');
  assert.equal(res.body.invoice.amountPaid, '40.00');
});

test('POST /api/invoices rejects a malformed dueDate with 400, and does not burn an invoice number', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const customerId = await makeCustomer(agent);
  const line = { description: 'Part', unitPrice: 10, quantity: 1 };

  const bad = await agent.post('/api/invoices').send({ customerId, dueDate: 'not-a-date', lineItems: [line] });
  assert.equal(bad.status, 400);

  const good = await agent.post('/api/invoices').send({ customerId, lineItems: [line] });
  assert.equal(good.status, 201);
  assert.equal(good.body.invoice.number, 'INV-0001');
});

test('POST /api/invoices rejects an out-of-range unitPrice with 400, not 500', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const customerId = await makeCustomer(agent);

  const res = await agent.post('/api/invoices').send({
    customerId,
    lineItems: [{ description: 'Part', unitPrice: 99999999999.99, quantity: 1 }],
  });
  assert.equal(res.status, 400);
});

test('POST /api/invoices rejects with 400 (not 500) when a computed total exceeds what Decimal(12,2) can hold, and does not burn an invoice number', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const customerId = await makeCustomer(agent);

  // Each individual unitPrice (9999999999.99) passes the per-line zod cap,
  // but two of them summed blows past the subtotal/total column's
  // Decimal(12,2) ceiling (9999999999.99) — the case MAX_MONEY_VALUE guards.
  const tooLarge = await agent.post('/api/invoices').send({
    customerId,
    lineItems: [
      { description: 'Part A', unitPrice: 9999999999.99, quantity: 1 },
      { description: 'Part B', unitPrice: 9999999999.99, quantity: 1 },
    ],
  });
  assert.equal(tooLarge.status, 400);

  const good = await agent.post('/api/invoices').send({
    customerId,
    lineItems: [{ description: 'Part', unitPrice: 10, quantity: 1 }],
  });
  assert.equal(good.status, 201);
  assert.equal(good.body.invoice.number, 'INV-0001');
});

test('PATCH /api/invoices/:id/status rejects a partially_paid amountPaid that rounds up to the full total', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const customerId = await makeCustomer(agent);
  const created = await agent.post('/api/invoices').send({
    customerId,
    lineItems: [{ description: 'Part', unitPrice: 100, quantity: 1 }],
  });
  const invoiceId = created.body.invoice.id as string;

  const res = await agent
    .patch(`/api/invoices/${invoiceId}/status`)
    .send({ status: 'partially_paid', amountPaid: 99.999999 });
  assert.equal(res.status, 400);
});

test('PATCH /api/invoices/:id/status rejects a partially_paid amountPaid that rounds down to zero', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const customerId = await makeCustomer(agent);
  const created = await agent.post('/api/invoices').send({
    customerId,
    lineItems: [{ description: 'Part', unitPrice: 100, quantity: 1 }],
  });
  const invoiceId = created.body.invoice.id as string;

  const res = await agent
    .patch(`/api/invoices/${invoiceId}/status`)
    .send({ status: 'partially_paid', amountPaid: 0.0000001 });
  assert.equal(res.status, 400);
});

test('PATCH /api/invoices/:id/status rejects an amountPaid on an overdue transition', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const customerId = await makeCustomer(agent);
  const created = await agent.post('/api/invoices').send({
    customerId,
    lineItems: [{ description: 'Part', unitPrice: 100, quantity: 1 }],
  });
  const invoiceId = created.body.invoice.id as string;

  const res = await agent.patch(`/api/invoices/${invoiceId}/status`).send({ status: 'overdue', amountPaid: 999999 });
  assert.equal(res.status, 400);
});

test('PATCH /api/invoices/:id/status accepts an overdue transition with no amountPaid', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const customerId = await makeCustomer(agent);
  const created = await agent.post('/api/invoices').send({
    customerId,
    lineItems: [{ description: 'Part', unitPrice: 100, quantity: 1 }],
  });
  const invoiceId = created.body.invoice.id as string;

  const res = await agent.patch(`/api/invoices/${invoiceId}/status`).send({ status: 'overdue' });
  assert.equal(res.status, 200);
  assert.equal(res.body.invoice.status, 'overdue');
});

test('PATCH /api/invoices/:id/status treats paid as a terminal status', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const customerId = await makeCustomer(agent);
  const created = await agent.post('/api/invoices').send({
    customerId,
    lineItems: [{ description: 'Part', unitPrice: 100, quantity: 1 }],
  });
  const invoiceId = created.body.invoice.id as string;

  const paid = await agent.patch(`/api/invoices/${invoiceId}/status`).send({ status: 'paid', amountPaid: 100 });
  assert.equal(paid.status, 200);

  const unpay = await agent
    .patch(`/api/invoices/${invoiceId}/status`)
    .send({ status: 'partially_paid', amountPaid: 1 });
  assert.equal(unpay.status, 400);
});

test('PATCH /api/invoices/:id/status allows recording a second, larger partial payment', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const customerId = await makeCustomer(agent);
  const created = await agent.post('/api/invoices').send({
    customerId,
    lineItems: [{ description: 'Part', unitPrice: 100, quantity: 1 }],
  });
  const invoiceId = created.body.invoice.id as string;

  const first = await agent
    .patch(`/api/invoices/${invoiceId}/status`)
    .send({ status: 'partially_paid', amountPaid: 30 });
  assert.equal(first.status, 200);
  assert.equal(first.body.invoice.amountPaid, '30.00');

  const second = await agent
    .patch(`/api/invoices/${invoiceId}/status`)
    .send({ status: 'partially_paid', amountPaid: 60 });
  assert.equal(second.status, 200);
  assert.equal(second.body.invoice.status, 'partially_paid');
  assert.equal(second.body.invoice.amountPaid, '60.00');
});

test('PATCH /api/invoices/:id/status allows re-confirming overdue on an already-overdue invoice', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const customerId = await makeCustomer(agent);
  const created = await agent.post('/api/invoices').send({
    customerId,
    lineItems: [{ description: 'Part', unitPrice: 100, quantity: 1 }],
  });
  const invoiceId = created.body.invoice.id as string;

  const first = await agent.patch(`/api/invoices/${invoiceId}/status`).send({ status: 'overdue' });
  assert.equal(first.status, 200);
  assert.equal(first.body.invoice.status, 'overdue');

  const second = await agent.patch(`/api/invoices/${invoiceId}/status`).send({ status: 'overdue' });
  assert.equal(second.status, 200);
  assert.equal(second.body.invoice.status, 'overdue');
});

test('POST /api/quotes/:id/convert-to-invoice requires an accepted quote', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const customerId = await makeCustomer(agent);
  const created = await agent.post('/api/quotes').send({
    customerId,
    lineItems: [{ description: 'Part', unitPrice: 100, quantity: 1 }],
  });
  const quoteId = created.body.quote.id as string;

  const res = await agent.post(`/api/quotes/${quoteId}/convert-to-invoice`);
  assert.equal(res.status, 400);
});

test('POST /api/quotes/:id/convert-to-invoice copies totals and line items from an accepted quote', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  await agent.patch('/api/company-profile').send({ vatRegistered: true, vatNumber: '4123456789' });
  const customerId = await makeCustomer(agent);
  const created = await agent.post('/api/quotes').send({
    customerId,
    lineItems: [{ description: 'Custom bracket', unitPrice: 100, quantity: 2 }],
  });
  const quoteId = created.body.quote.id as string;
  await agent.patch(`/api/quotes/${quoteId}/status`).send({ status: 'sent' });
  await agent.patch(`/api/quotes/${quoteId}/status`).send({ status: 'accepted' });

  const res = await agent.post(`/api/quotes/${quoteId}/convert-to-invoice`);

  assert.equal(res.status, 201);
  assert.equal(res.body.invoice.number, 'INV-0001');
  assert.equal(res.body.invoice.quoteId, quoteId);
  assert.equal(res.body.invoice.vatApplied, true);
  assert.equal(res.body.invoice.subtotal, '200.00');
  assert.equal(res.body.invoice.vatAmount, '30.00');
  assert.equal(res.body.invoice.total, '230.00');
  assert.equal(res.body.invoice.lineItems[0].description, 'Custom bracket');
  assert.equal(res.body.invoice.lineItems[0].lineTotal, '200.00');

  const quoteAfterConversion = await agent.get(`/api/quotes/${quoteId}`);
  assert.equal(quoteAfterConversion.body.quote.invoiceId, res.body.invoice.id);
});

test('POST /api/quotes/:id/convert-to-invoice carries the quote\'s discount and paymentTerms/termsAndConditionsText over to the invoice', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  await agent.patch('/api/company-profile').send({ vatRegistered: true, vatNumber: '4123456789' });
  const customerId = await makeCustomer(agent);
  const created = await agent.post('/api/quotes').send({
    customerId,
    discountPercent: 10,
    discountAppliesTo: 'total',
    paymentTerms: '50% deposit.',
    termsAndConditionsText: 'Quote-specific terms.',
    lineItems: [{ description: 'Custom bracket', unitPrice: 100, quantity: 2 }],
  });
  const quoteId = created.body.quote.id as string;
  await agent.patch(`/api/quotes/${quoteId}/status`).send({ status: 'sent' });
  await agent.patch(`/api/quotes/${quoteId}/status`).send({ status: 'accepted' });

  const res = await agent.post(`/api/quotes/${quoteId}/convert-to-invoice`);

  assert.equal(res.status, 201);
  assert.equal(res.body.invoice.discountPercent, '10.00');
  assert.equal(res.body.invoice.discountAppliesTo, 'total');
  assert.equal(res.body.invoice.discountAmount, created.body.quote.discountAmount);
  assert.equal(res.body.invoice.paymentTerms, '50% deposit.');
  assert.equal(res.body.invoice.termsAndConditionsText, 'Quote-specific terms.');
});

test('POST /api/quotes/:id/convert-to-invoice rejects converting the same quote twice', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const customerId = await makeCustomer(agent);
  const created = await agent.post('/api/quotes').send({
    customerId,
    lineItems: [{ description: 'Part', unitPrice: 100, quantity: 1 }],
  });
  const quoteId = created.body.quote.id as string;
  await agent.patch(`/api/quotes/${quoteId}/status`).send({ status: 'sent' });
  await agent.patch(`/api/quotes/${quoteId}/status`).send({ status: 'accepted' });

  const first = await agent.post(`/api/quotes/${quoteId}/convert-to-invoice`);
  assert.equal(first.status, 201);

  const second = await agent.post(`/api/quotes/${quoteId}/convert-to-invoice`);
  assert.equal(second.status, 400);
});

async function makeCustomerWithEmail(agent: ReturnType<typeof request.agent>) {
  const res = await agent.post('/api/customers').send({
    name: 'Bob Client',
    billingAddress: '5 Oak St',
    email: 'bob@example.com',
  });
  return res.body.customer.id as string;
}

test('POST /api/invoices/:id/send returns a PDF and logs a dev-mode email when the customer has an email', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const customerId = await makeCustomerWithEmail(agent);
  const created = await agent.post('/api/invoices').send({
    customerId,
    lineItems: [{ description: 'Custom bracket', unitPrice: 200, quantity: 1 }],
  });

  const res = await agent.post(`/api/invoices/${created.body.invoice.id}/send`);

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.sentTo, 'bob@example.com');
  assert.equal(res.body.devMode, true);
  assert.ok(typeof res.body.pdfBase64 === 'string' && res.body.pdfBase64.length > 0);
  const pdfBuffer = Buffer.from(res.body.pdfBase64, 'base64');
  assert.equal(pdfBuffer.subarray(0, 4).toString('ascii'), '%PDF');
});

test('POST /api/invoices/:id/send rejects with 400 when the customer has no email on file', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const customerId = await makeCustomer(agent);
  const created = await agent.post('/api/invoices').send({
    customerId,
    lineItems: [{ description: 'Custom bracket', unitPrice: 200, quantity: 1 }],
  });

  const res = await agent.post(`/api/invoices/${created.body.invoice.id}/send`);

  assert.equal(res.status, 400);
  assert.match(res.body.error, /no email on file/);
});

test('POST /api/invoices/:id/send gives the email sender the tenant business name and reply-to address in the correct positions', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const customerId = await makeCustomerWithEmail(agent);
  const created = await agent.post('/api/invoices').send({
    customerId,
    lineItems: [{ description: 'Custom bracket', unitPrice: 200, quantity: 1 }],
  });

  mock.method(mailer, 'isConfigured', () => true);
  const sendMailCalls: Array<Record<string, unknown>> = [];
  mock.method(mailer, 'sendMail', async (opts: Record<string, unknown>) => {
    sendMailCalls.push(opts);
  });

  try {
    const res = await agent.post(`/api/invoices/${created.body.invoice.id}/send`);
    assert.equal(res.status, 200);
    assert.equal(sendMailCalls.length, 1);

    // sendDocumentEmail(to, documentType, documentNumber, pdfBuffer,
    // businessName, replyTo) feeds businessName into the subject/text and
    // replyTo into the reply-to header. profile.businessName ('Acme
    // Prints') and profile.email ('jane@acmeprints.co.za') are both
    // strings, so a swap of the two arguments at the invoices.ts call site
    // would typecheck fine — only asserting the actual values in their
    // actual destinations catches it.
    assert.equal(sendMailCalls[0].replyTo, 'jane@acmeprints.co.za');
    assert.match(sendMailCalls[0].subject as string, /Acme Prints/);
    assert.match(sendMailCalls[0].text as string, /Acme Prints/);
    assert.doesNotMatch(sendMailCalls[0].subject as string, /jane@acmeprints\.co\.za/);
  } finally {
    mock.restoreAll();
  }
});

test('POST /api/invoices/:id/send returns 404 for an invoice belonging to another tenant', async () => {
  const app = buildApp();
  const agentA = await loggedInAgent(app, 'jane@acmeprints.co.za');
  const customerId = await makeCustomerWithEmail(agentA);
  const created = await agentA.post('/api/invoices').send({
    customerId,
    lineItems: [{ description: 'Custom bracket', unitPrice: 200, quantity: 1 }],
  });

  const agentB = await loggedInAgent(app, 'sam@othershop.co.za');
  const res = await agentB.post(`/api/invoices/${created.body.invoice.id}/send`);

  assert.equal(res.status, 404);
});

test('POST /api/invoices rejects with 400 (not 500) when the computed number already exists for this tenant', async () => {
  // Backlog #35: @@unique([tenantId, number]) is defense-in-depth against a
  // duplicate Invoice.number for the SAME tenant -- the atomic
  // tenantSequences.next() makes this unreachable through the API's own
  // create flow (each call gets a strictly higher value), so this test
  // simulates the only other realistic way a duplicate could exist: a row
  // inserted by something other than this route (a data-fix script, a
  // migration, a bug elsewhere) sitting at the exact number the sequence is
  // about to hand out next.
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const customerId = await makeCustomer(agent);

  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { email: 'jane@acmeprints.co.za' } });
  await prisma.invoice.create({
    data: {
      tenantId: tenant.id,
      customerId,
      number: 'INV-0001', // matches what tenantSequences.next('invoice') will hand out first
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      vatApplied: false,
      subtotal: '100.00',
      vatAmount: '0.00',
      total: '100.00',
    },
  });

  const res = await agent.post('/api/invoices').send({
    customerId,
    lineItems: [{ description: 'Custom bracket', unitPrice: 150, quantity: 1 }],
  });

  assert.equal(res.status, 400);
  assert.match(res.body.error, /already exists/);
});

test('GET /api/invoices/stats returns totalOutstanding, totalPaid, paidCount, unpaidCount, and overdueCount against fixture data', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const customerId = await makeCustomer(agent);

  // A paid invoice -- contributes to totalPaid/paidCount only.
  const paidRes = await agent.post('/api/invoices').send({
    customerId,
    lineItems: [{ description: 'Paid widget', unitPrice: 300, quantity: 1 }],
  });
  await agent.patch(`/api/invoices/${paidRes.body.invoice.id}/status`).send({ status: 'paid', amountPaid: 300 });

  // A partially-paid invoice, not past due -- counts as "unpaid" and contributes its remaining balance to totalOutstanding.
  const partiallyPaidRes = await agent.post('/api/invoices').send({
    customerId,
    lineItems: [{ description: 'Partially paid widget', unitPrice: 200, quantity: 1 }],
  });
  await agent.patch(`/api/invoices/${partiallyPaidRes.body.invoice.id}/status`).send({ status: 'partially_paid', amountPaid: 50 });

  // An overdue (past-due, unpaid) invoice -- counts as "unpaid" and "overdue", contributes its full total to totalOutstanding.
  const pastDueDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  await agent.post('/api/invoices').send({
    customerId,
    dueDate: pastDueDate,
    lineItems: [{ description: 'Overdue widget', unitPrice: 80, quantity: 1 }],
  });

  const res = await agent.get('/api/invoices/stats');
  assert.equal(res.status, 200);
  // (200 - 50) + (80 - 0) = 230.00
  assert.equal(res.body.totalOutstanding, '230.00');
  assert.equal(res.body.totalPaid, '300.00');
  assert.equal(res.body.paidCount, 1);
  assert.equal(res.body.unpaidCount, 2);
  assert.equal(res.body.overdueCount, 1);
});

test('GET /api/invoices/stats is tenant-isolated', async () => {
  const app = buildApp();
  const agentA = await loggedInAgent(app, 'stats-a@example.co.za');
  const customerId = await makeCustomer(agentA);
  const paidRes = await agentA.post('/api/invoices').send({
    customerId,
    lineItems: [{ description: 'Widget', unitPrice: 100, quantity: 1 }],
  });
  await agentA.patch(`/api/invoices/${paidRes.body.invoice.id}/status`).send({ status: 'paid', amountPaid: 100 });

  const agentB = await loggedInAgent(app, 'stats-b@example.co.za');
  const res = await agentB.get('/api/invoices/stats');
  assert.equal(res.status, 200);
  assert.equal(res.body.totalOutstanding, '0.00');
  assert.equal(res.body.totalPaid, '0.00');
  assert.equal(res.body.paidCount, 0);
  assert.equal(res.body.unpaidCount, 0);
  assert.equal(res.body.overdueCount, 0);
});
