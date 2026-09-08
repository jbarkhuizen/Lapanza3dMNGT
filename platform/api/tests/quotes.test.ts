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
