import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildApp } from '../src/app.js';
import { buildMinimalApp, loggedInAgent, resetTestDatabase } from './helpers/testApp.js';
import { prisma } from '../src/db/client.js';
import { customersRouter } from '../src/routes/customers.js';

beforeEach(resetTestDatabase);

test('customer endpoints require auth', async () => {
  const app = buildMinimalApp(customersRouter);
  const res = await request(app).get('/api/customers');
  assert.equal(res.status, 401);
});

test('POST /api/customers rejects a missing required field', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);

  const res = await agent.post('/api/customers').send({ name: 'No Address Co' });
  assert.equal(res.status, 400);
});

test('full create -> list -> get -> update cycle', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);

  const createRes = await agent.post('/api/customers').send({
    name: 'Print Buyer CC',
    billingAddress: '5 Oak Ave, Centurion',
  });
  assert.equal(createRes.status, 201);
  const customerId = createRes.body.customer.id;

  const listRes = await agent.get('/api/customers');
  assert.equal(listRes.status, 200);
  assert.equal(listRes.body.customers.length, 1);

  const getRes = await agent.get(`/api/customers/${customerId}`);
  assert.equal(getRes.status, 200);
  assert.equal(getRes.body.customer.name, 'Print Buyer CC');

  const updateRes = await agent
    .patch(`/api/customers/${customerId}`)
    .send({ notes: 'Prefers matte finish' });
  assert.equal(updateRes.status, 200);
  assert.equal(updateRes.body.customer.id, customerId);
  assert.equal(updateRes.body.customer.notes, 'Prefers matte finish');
  assert.equal(updateRes.body.customer.name, 'Print Buyer CC');

  const getAfterUpdate = await agent.get(`/api/customers/${customerId}`);
  assert.equal(getAfterUpdate.body.customer.notes, 'Prefers matte finish');
});

test('updatedAt equals createdAt on creation, then changes after a PATCH', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);

  const createRes = await agent.post('/api/customers').send({
    name: 'Print Buyer CC',
    billingAddress: '5 Oak Ave, Centurion',
  });
  assert.equal(createRes.status, 201);
  assert.equal(createRes.body.customer.updatedAt, createRes.body.customer.createdAt);

  // Timestamptz(3) columns are millisecond-precision — without a small delay
  // a fast PATCH could land in the same millisecond as the create and make
  // the "changed" assertion below flaky. Same pattern as notifications.test.ts.
  await new Promise((resolve) => setTimeout(resolve, 5));

  const updateRes = await agent
    .patch(`/api/customers/${createRes.body.customer.id}`)
    .send({ notes: 'Prefers matte finish' });
  assert.equal(updateRes.status, 200);
  assert.notEqual(updateRes.body.customer.updatedAt, updateRes.body.customer.createdAt);
  assert.ok(new Date(updateRes.body.customer.updatedAt) > new Date(createRes.body.customer.updatedAt));
});

test('PATCH /api/customers/:id returns 404 for another tenant\'s customer', async () => {
  const app = buildApp();
  const agentA = await loggedInAgent(app);

  await request(app).post('/api/auth/register').send({
    businessName: 'Other Shop',
    contactName: 'Bob Doe',
    email: 'bob@othershop.co.za',
    password: 'correct horse battery staple',
  });
  const tenantB = await prisma.tenant.findUnique({ where: { email: 'bob@othershop.co.za' } });
  await request(app).post('/api/auth/verify-email').send({ token: tenantB?.verificationToken });
  const agentB = request.agent(app);
  await agentB.post('/api/auth/login').send({ email: 'bob@othershop.co.za', password: 'correct horse battery staple' });

  const plan = await prisma.plan.findFirstOrThrow({ where: { name: 'Tier 1' } });
  await prisma.subscription.create({
    data: {
      tenantId: tenantB!.id,
      planId: plan.id,
      status: 'active',
      paymentProvider: 'payfast',
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
  });

  const createRes = await agentA.post('/api/customers').send({
    name: 'Print Buyer CC',
    billingAddress: '5 Oak Ave, Centurion',
  });

  const res = await agentB.patch(`/api/customers/${createRes.body.customer.id}`).send({ notes: 'x' });
  assert.equal(res.status, 404);
});

test('a lapsed subscription blocks POST /api/customers with 402 but not GET /api/customers', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);

  const tenant = await prisma.tenant.findUnique({ where: { email: 'jane@acmeprints.co.za' } });
  await prisma.subscription.update({
    where: { tenantId: tenant!.id },
    data: { status: 'lapsed' },
  });

  const createRes = await agent.post('/api/customers').send({
    name: 'Print Buyer CC',
    billingAddress: '5 Oak Ave, Centurion',
  });
  assert.equal(createRes.status, 402);

  const listRes = await agent.get('/api/customers');
  assert.equal(listRes.status, 200);
});

test('GET /api/customers/stats returns totalClients, outstanding, and withOverdue against fixture data', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);

  const customerARes = await agent.post('/api/customers').send({ name: 'Customer A', billingAddress: '1 Main St' });
  const customerAId = customerARes.body.customer.id;
  const customerBRes = await agent.post('/api/customers').send({ name: 'Customer B', billingAddress: '2 Main St' });
  const customerBId = customerBRes.body.customer.id;

  // Customer A: a partially-paid invoice (still counts toward outstanding) and an
  // overdue invoice -- both invoices belong to the same customer, so withOverdue
  // must count distinct customers, not invoices.
  const partiallyPaidRes = await agent.post('/api/invoices').send({
    customerId: customerAId,
    lineItems: [{ description: 'Widget', unitPrice: 200, quantity: 1 }],
  });
  await agent.patch(`/api/invoices/${partiallyPaidRes.body.invoice.id}/status`).send({ status: 'partially_paid', amountPaid: 50 });

  const pastDueDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  await agent.post('/api/invoices').send({
    customerId: customerAId,
    dueDate: pastDueDate,
    lineItems: [{ description: 'Overdue widget', unitPrice: 80, quantity: 1 }],
  });

  // Customer B: a fully paid invoice -- must not contribute to outstanding.
  const paidRes = await agent.post('/api/invoices').send({
    customerId: customerBId,
    lineItems: [{ description: 'Paid widget', unitPrice: 100, quantity: 1 }],
  });
  await agent.patch(`/api/invoices/${paidRes.body.invoice.id}/status`).send({ status: 'paid', amountPaid: 100 });

  const res = await agent.get('/api/customers/stats');
  assert.equal(res.status, 200);
  assert.equal(res.body.totalClients, 2);
  // (200 - 50) + (80 - 0) = 230.00
  assert.equal(res.body.outstanding, '230.00');
  assert.equal(res.body.withOverdue, 1);
});

test('GET /api/customers/stats is tenant-isolated', async () => {
  const app = buildApp();
  const agentA = await loggedInAgent(app, 'stats-a@example.co.za');
  const customerRes = await agentA.post('/api/customers').send({ name: 'A Co', billingAddress: '1 Main St' });
  const pastDueDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  await agentA.post('/api/invoices').send({
    customerId: customerRes.body.customer.id,
    dueDate: pastDueDate,
    lineItems: [{ description: 'Widget', unitPrice: 100, quantity: 1 }],
  });

  const agentB = await loggedInAgent(app, 'stats-b@example.co.za');
  const res = await agentB.get('/api/customers/stats');
  assert.equal(res.status, 200);
  assert.equal(res.body.totalClients, 0);
  assert.equal(res.body.outstanding, '0.00');
  assert.equal(res.body.withOverdue, 0);
});

test('GET /api/customers/:id returns 404 for another tenant\'s customer', async () => {
  const app = buildApp();
  const agentA = await loggedInAgent(app);

  await request(app).post('/api/auth/register').send({
    businessName: 'Other Shop',
    contactName: 'Bob Doe',
    email: 'bob@othershop.co.za',
    password: 'correct horse battery staple',
  });
  const tenantB = await prisma.tenant.findUnique({ where: { email: 'bob@othershop.co.za' } });
  await request(app).post('/api/auth/verify-email').send({ token: tenantB?.verificationToken });
  const agentB = request.agent(app);
  await agentB.post('/api/auth/login').send({ email: 'bob@othershop.co.za', password: 'correct horse battery staple' });

  const createRes = await agentA.post('/api/customers').send({
    name: 'Print Buyer CC',
    billingAddress: '5 Oak Ave, Centurion',
  });

  const res = await agentB.get(`/api/customers/${createRes.body.customer.id}`);
  assert.equal(res.status, 404);
});
