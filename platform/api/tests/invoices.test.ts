import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildApp } from '../src/app.js';
import { resetTestDatabase } from './helpers/testApp.js';
import { prisma } from '../src/db/client.js';

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
  assert.ok(res.body.invoice.dueDate);
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
