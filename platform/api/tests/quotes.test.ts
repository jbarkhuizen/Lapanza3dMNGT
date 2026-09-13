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

test('quote endpoints require auth', async () => {
  const app = buildApp();
  const res = await request(app).get('/api/quotes');
  assert.equal(res.status, 401);
});

test('POST /api/quotes rejects a missing customer or line items', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const res = await agent.post('/api/quotes').send({ customerId: 'nope', lineItems: [] });
  assert.equal(res.status, 400);
});

test('POST /api/quotes rejects an unknown customer', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const res = await agent.post('/api/quotes').send({
    customerId: 'does-not-exist',
    lineItems: [{ description: 'Custom part', unitPrice: 100, quantity: 1 }],
  });
  assert.equal(res.status, 400);
});

test('POST /api/quotes creates an ad-hoc-line quote, numbered QT-0001, no VAT by default', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const customerId = await makeCustomer(agent);

  const res = await agent.post('/api/quotes').send({
    customerId,
    lineItems: [{ description: 'Custom bracket', unitPrice: 150, quantity: 2 }],
  });

  assert.equal(res.status, 201);
  assert.equal(res.body.quote.number, 'QT-0001');
  assert.equal(res.body.quote.status, 'draft');
  assert.equal(res.body.quote.vatApplied, false);
  assert.equal(res.body.quote.subtotal, '300.00');
  assert.equal(res.body.quote.vatAmount, '0.00');
  assert.equal(res.body.quote.total, '300.00');
  assert.equal(res.body.quote.lineItems[0].lineTotal, '300.00');
  assert.equal(res.body.quote.invoiceId, null);
});

test('POST /api/quotes applies VAT when the tenant is VAT-registered', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  await agent.patch('/api/company-profile').send({ vatRegistered: true, vatNumber: '4123456789' });
  const customerId = await makeCustomer(agent);

  const res = await agent.post('/api/quotes').send({
    customerId,
    lineItems: [{ description: 'Custom bracket', unitPrice: 100, quantity: 1 }],
  });

  assert.equal(res.status, 201);
  assert.equal(res.body.quote.vatApplied, true);
  assert.equal(res.body.quote.subtotal, '100.00');
  assert.equal(res.body.quote.vatAmount, '15.00');
  assert.equal(res.body.quote.total, '115.00');
});

test('POST /api/quotes rejects an unknown costing template line', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const customerId = await makeCustomer(agent);

  const res = await agent.post('/api/quotes').send({
    customerId,
    lineItems: [{ costingTemplateId: 'does-not-exist', quantity: 1 }],
  });
  assert.equal(res.status, 400);
});

test('quote numbers increment across successive quotes for the same tenant', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const customerId = await makeCustomer(agent);
  const line = { description: 'Part', unitPrice: 10, quantity: 1 };

  const first = await agent.post('/api/quotes').send({ customerId, lineItems: [line] });
  const second = await agent.post('/api/quotes').send({ customerId, lineItems: [line] });

  assert.equal(first.body.quote.number, 'QT-0001');
  assert.equal(second.body.quote.number, 'QT-0002');
});

test('POST /api/quotes rejects a malformed validUntil with 400, and does not burn a quote number', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const customerId = await makeCustomer(agent);
  const line = { description: 'Part', unitPrice: 10, quantity: 1 };

  const bad = await agent.post('/api/quotes').send({ customerId, validUntil: 'not-a-date', lineItems: [line] });
  assert.equal(bad.status, 400);

  const good = await agent.post('/api/quotes').send({ customerId, lineItems: [line] });
  assert.equal(good.status, 201);
  assert.equal(good.body.quote.number, 'QT-0001');
});

test('POST /api/quotes rejects an out-of-range unitPrice with 400, not 500', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const customerId = await makeCustomer(agent);

  const res = await agent.post('/api/quotes').send({
    customerId,
    lineItems: [{ description: 'Part', unitPrice: 99999999999.99, quantity: 1 }],
  });
  assert.equal(res.status, 400);
});

test('POST /api/quotes rejects with 400 (not 500) when a computed total exceeds what Decimal(12,2) can hold, and does not burn a quote number', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const customerId = await makeCustomer(agent);

  // Each individual unitPrice (9999999999.99) passes the per-line zod cap,
  // but two of them summed blows past the subtotal/total column's
  // Decimal(12,2) ceiling (9999999999.99) — the case MAX_MONEY_VALUE guards.
  const tooLarge = await agent.post('/api/quotes').send({
    customerId,
    lineItems: [
      { description: 'Part A', unitPrice: 9999999999.99, quantity: 1 },
      { description: 'Part B', unitPrice: 9999999999.99, quantity: 1 },
    ],
  });
  assert.equal(tooLarge.status, 400);

  const good = await agent.post('/api/quotes').send({
    customerId,
    lineItems: [{ description: 'Part', unitPrice: 10, quantity: 1 }],
  });
  assert.equal(good.status, 201);
  assert.equal(good.body.quote.number, 'QT-0001');
});

test('a lapsed subscription blocks POST /api/quotes with 402', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const customerId = await makeCustomer(agent);

  const tenant = await prisma.tenant.findUnique({ where: { email: 'jane@acmeprints.co.za' } });
  await prisma.subscription.update({
    where: { tenantId: tenant!.id },
    data: { status: 'lapsed' },
  });

  const res = await agent.post('/api/quotes').send({
    customerId,
    lineItems: [{ description: 'Custom bracket', unitPrice: 150, quantity: 2 }],
  });
  assert.equal(res.status, 402);
});

test('PATCH /api/quotes/:id/status enforces the draft -> sent -> accepted lifecycle', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const customerId = await makeCustomer(agent);
  const created = await agent.post('/api/quotes').send({
    customerId,
    lineItems: [{ description: 'Part', unitPrice: 10, quantity: 1 }],
  });
  const quoteId = created.body.quote.id as string;

  const skipStraightToAccepted = await agent.patch(`/api/quotes/${quoteId}/status`).send({ status: 'accepted' });
  assert.equal(skipStraightToAccepted.status, 400);

  const toSent = await agent.patch(`/api/quotes/${quoteId}/status`).send({ status: 'sent' });
  assert.equal(toSent.status, 200);
  assert.equal(toSent.body.quote.status, 'sent');

  const toAccepted = await agent.patch(`/api/quotes/${quoteId}/status`).send({ status: 'accepted' });
  assert.equal(toAccepted.status, 200);
  assert.equal(toAccepted.body.quote.status, 'accepted');

  const backToSent = await agent.patch(`/api/quotes/${quoteId}/status`).send({ status: 'sent' });
  assert.equal(backToSent.status, 400);
});

async function makeCustomerWithEmail(agent: ReturnType<typeof request.agent>) {
  const res = await agent.post('/api/customers').send({
    name: 'Bob Client',
    billingAddress: '5 Oak St',
    email: 'bob@example.com',
  });
  return res.body.customer.id as string;
}

test('POST /api/quotes/:id/send returns a PDF and logs a dev-mode email when the customer has an email', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const customerId = await makeCustomerWithEmail(agent);
  const created = await agent.post('/api/quotes').send({
    customerId,
    lineItems: [{ description: 'Custom bracket', unitPrice: 150, quantity: 2 }],
  });

  const res = await agent.post(`/api/quotes/${created.body.quote.id}/send`);

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.sentTo, 'bob@example.com');
  assert.equal(res.body.devMode, true);
  assert.ok(typeof res.body.pdfBase64 === 'string' && res.body.pdfBase64.length > 0);
  const pdfBuffer = Buffer.from(res.body.pdfBase64, 'base64');
  assert.equal(pdfBuffer.subarray(0, 4).toString('ascii'), '%PDF');
});

test('POST /api/quotes/:id/send rejects with 400 when the customer has no email on file', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const customerId = await makeCustomer(agent);
  const created = await agent.post('/api/quotes').send({
    customerId,
    lineItems: [{ description: 'Custom bracket', unitPrice: 150, quantity: 2 }],
  });

  const res = await agent.post(`/api/quotes/${created.body.quote.id}/send`);

  assert.equal(res.status, 400);
  assert.match(res.body.error, /no email on file/);
});

test('POST /api/quotes/:id/send gives the email sender the tenant business name and reply-to address in the correct positions', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const customerId = await makeCustomerWithEmail(agent);
  const created = await agent.post('/api/quotes').send({
    customerId,
    lineItems: [{ description: 'Custom bracket', unitPrice: 150, quantity: 2 }],
  });

  mock.method(mailer, 'isConfigured', () => true);
  const sendMailCalls: Array<Record<string, unknown>> = [];
  mock.method(mailer, 'sendMail', async (opts: Record<string, unknown>) => {
    sendMailCalls.push(opts);
  });

  try {
    const res = await agent.post(`/api/quotes/${created.body.quote.id}/send`);
    assert.equal(res.status, 200);
    assert.equal(sendMailCalls.length, 1);

    // sendDocumentEmail(to, documentType, documentNumber, pdfBuffer,
    // businessName, replyTo) feeds businessName into the subject/text and
    // replyTo into the reply-to header. profile.businessName ('Acme
    // Prints') and profile.email ('jane@acmeprints.co.za') are both
    // strings, so a swap of the two arguments at the quotes.ts call site
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

test('POST /api/quotes/:id/send returns 404 for a quote belonging to another tenant', async () => {
  const app = buildApp();
  const agentA = await loggedInAgent(app, 'jane@acmeprints.co.za');
  const customerId = await makeCustomerWithEmail(agentA);
  const created = await agentA.post('/api/quotes').send({
    customerId,
    lineItems: [{ description: 'Custom bracket', unitPrice: 150, quantity: 2 }],
  });

  const agentB = await loggedInAgent(app, 'sam@othershop.co.za');
  const res = await agentB.post(`/api/quotes/${created.body.quote.id}/send`);

  assert.equal(res.status, 404);
});

test('POST /api/quotes rejects with 400 (not 500) when the computed number already exists for this tenant', async () => {
  // Backlog #35: @@unique([tenantId, number]) is defense-in-depth against a
  // duplicate Quote.number for the SAME tenant -- the atomic
  // tenantSequences.next() makes this unreachable through the API's own
  // create flow, so this test simulates the only other realistic way a
  // duplicate could exist: a row inserted by something other than this
  // route sitting at the exact number the sequence is about to hand out.
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const customerId = await makeCustomer(agent);

  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { email: 'jane@acmeprints.co.za' } });
  await prisma.quote.create({
    data: {
      tenantId: tenant.id,
      customerId,
      number: 'QT-0001', // matches what tenantSequences.next('quote') will hand out first
      vatApplied: false,
      subtotal: '100.00',
      vatAmount: '0.00',
      total: '100.00',
    },
  });

  const res = await agent.post('/api/quotes').send({
    customerId,
    lineItems: [{ description: 'Custom bracket', unitPrice: 150, quantity: 1 }],
  });

  assert.equal(res.status, 400);
  assert.match(res.body.error, /already exists/);
});

test('GET /api/quotes/stats returns totalQuotes, totalValue, expiredCount, and convertedCount against fixture data', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const customerId = await makeCustomer(agent);

  // A draft quote (never sent).
  await agent.post('/api/quotes').send({
    customerId,
    lineItems: [{ description: 'Draft widget', unitPrice: 100, quantity: 1 }],
  });

  // An expired quote.
  const expiredRes = await agent.post('/api/quotes').send({
    customerId,
    lineItems: [{ description: 'Expired widget', unitPrice: 200, quantity: 1 }],
  });
  await agent.patch(`/api/quotes/${expiredRes.body.quote.id}/status`).send({ status: 'sent' });
  await agent.patch(`/api/quotes/${expiredRes.body.quote.id}/status`).send({ status: 'expired' });

  // An accepted (converted) quote.
  const acceptedRes = await agent.post('/api/quotes').send({
    customerId,
    lineItems: [{ description: 'Accepted widget', unitPrice: 300, quantity: 1 }],
  });
  await agent.patch(`/api/quotes/${acceptedRes.body.quote.id}/status`).send({ status: 'sent' });
  await agent.patch(`/api/quotes/${acceptedRes.body.quote.id}/status`).send({ status: 'accepted' });

  const res = await agent.get('/api/quotes/stats');
  assert.equal(res.status, 200);
  assert.equal(res.body.totalQuotes, 3);
  assert.equal(res.body.totalValue, '600.00');
  assert.equal(res.body.expiredCount, 1);
  assert.equal(res.body.convertedCount, 1);
});

test('POST /api/quotes with discountAppliesTo "total" persists discountPercent/discountAppliesTo/discountAmount and discounts before VAT', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  await agent.patch('/api/company-profile').send({ vatRegistered: true, vatNumber: '4123456789' });
  const customerId = await makeCustomer(agent);

  const res = await agent.post('/api/quotes').send({
    customerId,
    discountPercent: 10,
    discountAppliesTo: 'total',
    lineItems: [
      { description: 'Part A', unitPrice: 50, quantity: 3 }, // 150.00
      { description: 'Part B', unitPrice: 33, quantity: 1 }, // 33.00
    ],
  });

  assert.equal(res.status, 201);
  // subtotal 183.00 -> discountAmount = round(183.00 * 10 / 100, 2) = 18.30
  // discountedSubtotal = 164.70 -> vatAmount = round(164.70 * 0.15, 2) = 24.71 -> total = 189.41
  assert.equal(res.body.quote.subtotal, '183.00');
  assert.equal(res.body.quote.discountPercent, '10.00');
  assert.equal(res.body.quote.discountAppliesTo, 'total');
  assert.equal(res.body.quote.discountAmount, '18.30');
  assert.equal(res.body.quote.vatAmount, '24.71');
  assert.equal(res.body.quote.total, '189.41');
  // 'total' mode leaves the persisted per-line totals undiscounted.
  assert.equal(res.body.quote.lineItems[0].lineTotal, '150.00');
  assert.equal(res.body.quote.lineItems[1].lineTotal, '33.00');
});

test('POST /api/quotes with discountAppliesTo "per_line" discounts each persisted line total before summing', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  await agent.patch('/api/company-profile').send({ vatRegistered: true, vatNumber: '4123456789' });
  const customerId = await makeCustomer(agent);

  const res = await agent.post('/api/quotes').send({
    customerId,
    discountPercent: 10,
    discountAppliesTo: 'per_line',
    lineItems: [
      { description: 'Part A', unitPrice: 50, quantity: 3 }, // 150.00
      { description: 'Part B', unitPrice: 33, quantity: 1 }, // 33.00
    ],
  });

  assert.equal(res.status, 201);
  assert.equal(res.body.quote.subtotal, '183.00');
  assert.equal(res.body.quote.discountAppliesTo, 'per_line');
  // Each persisted line total is discounted 10% before summing.
  assert.equal(res.body.quote.lineItems[0].lineTotal, '135.00');
  assert.equal(res.body.quote.lineItems[1].lineTotal, '29.70');
  assert.equal(res.body.quote.discountAmount, '18.30');
  assert.equal(res.body.quote.vatAmount, '24.71');
  assert.equal(res.body.quote.total, '189.41');
});

test('POST /api/quotes without discount fields persists discountAmount 0.00 and null discountPercent/discountAppliesTo', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const customerId = await makeCustomer(agent);

  const res = await agent.post('/api/quotes').send({
    customerId,
    lineItems: [{ description: 'Custom bracket', unitPrice: 150, quantity: 2 }],
  });

  assert.equal(res.status, 201);
  assert.equal(res.body.quote.discountPercent, null);
  assert.equal(res.body.quote.discountAppliesTo, null);
  assert.equal(res.body.quote.discountAmount, '0.00');
});

test('POST /api/quotes rejects a discountPercent above 100', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const customerId = await makeCustomer(agent);

  const res = await agent.post('/api/quotes').send({
    customerId,
    discountPercent: 101,
    discountAppliesTo: 'total',
    lineItems: [{ description: 'Part', unitPrice: 10, quantity: 1 }],
  });
  assert.equal(res.status, 400);
});

test('POST /api/quotes defaults paymentTerms/termsAndConditionsText/notes from the tenant profile only when the request supplies none', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  await agent.patch('/api/company-profile').send({
    defaultPaymentTerms: '50% deposit, balance on delivery.',
    defaultNotes: 'Standard tenant note.',
    termsAndConditionsText: 'Standard tenant T&Cs.',
  });
  const customerId = await makeCustomer(agent);

  const usesDefaults = await agent.post('/api/quotes').send({
    customerId,
    lineItems: [{ description: 'Part', unitPrice: 10, quantity: 1 }],
  });
  assert.equal(usesDefaults.status, 201);
  assert.equal(usesDefaults.body.quote.paymentTerms, '50% deposit, balance on delivery.');
  assert.equal(usesDefaults.body.quote.notes, 'Standard tenant note.');
  assert.equal(usesDefaults.body.quote.termsAndConditionsText, 'Standard tenant T&Cs.');

  const overridesDefaults = await agent.post('/api/quotes').send({
    customerId,
    notes: 'Rush this one.',
    paymentTerms: 'Payment on collection.',
    termsAndConditionsText: 'One-off terms for this quote.',
    lineItems: [{ description: 'Part', unitPrice: 10, quantity: 1 }],
  });
  assert.equal(overridesDefaults.status, 201);
  assert.equal(overridesDefaults.body.quote.paymentTerms, 'Payment on collection.');
  assert.equal(overridesDefaults.body.quote.notes, 'Rush this one.');
  assert.equal(overridesDefaults.body.quote.termsAndConditionsText, 'One-off terms for this quote.');

  // Editing the tenant default afterward must not retroactively change the already-created quote.
  await agent.patch('/api/company-profile').send({ defaultPaymentTerms: 'Changed default.' });
  const reFetched = await agent.get(`/api/quotes/${usesDefaults.body.quote.id}`);
  assert.equal(reFetched.body.quote.paymentTerms, '50% deposit, balance on delivery.');
});

test('PATCH /api/quotes/:id edits notes/paymentTerms/termsAndConditionsText on an already-created quote', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const customerId = await makeCustomer(agent);
  const created = await agent.post('/api/quotes').send({
    customerId,
    lineItems: [{ description: 'Part', unitPrice: 10, quantity: 1 }],
  });
  const quoteId = created.body.quote.id as string;

  const res = await agent.patch(`/api/quotes/${quoteId}`).send({
    notes: 'Updated notes.',
    paymentTerms: 'Net 15.',
    termsAndConditionsText: 'Updated terms.',
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.quote.notes, 'Updated notes.');
  assert.equal(res.body.quote.paymentTerms, 'Net 15.');
  assert.equal(res.body.quote.termsAndConditionsText, 'Updated terms.');
});

test('PATCH /api/quotes/:id returns 404 for a quote belonging to another tenant', async () => {
  const app = buildApp();
  const agentA = await loggedInAgent(app, 'jane@acmeprints.co.za');
  const customerId = await makeCustomer(agentA);
  const created = await agentA.post('/api/quotes').send({
    customerId,
    lineItems: [{ description: 'Part', unitPrice: 10, quantity: 1 }],
  });

  const agentB = await loggedInAgent(app, 'sam@othershop.co.za');
  const res = await agentB.patch(`/api/quotes/${created.body.quote.id}`).send({ notes: 'nope' });
  assert.equal(res.status, 404);
});

test('GET /api/quotes/stats is tenant-isolated', async () => {
  const app = buildApp();
  const agentA = await loggedInAgent(app, 'stats-a@example.co.za');
  const customerId = await makeCustomer(agentA);
  await agentA.post('/api/quotes').send({
    customerId,
    lineItems: [{ description: 'Widget', unitPrice: 100, quantity: 1 }],
  });

  const agentB = await loggedInAgent(app, 'stats-b@example.co.za');
  const res = await agentB.get('/api/quotes/stats');
  assert.equal(res.status, 200);
  assert.equal(res.body.totalQuotes, 0);
  assert.equal(res.body.totalValue, '0.00');
  assert.equal(res.body.expiredCount, 0);
  assert.equal(res.body.convertedCount, 0);
});
