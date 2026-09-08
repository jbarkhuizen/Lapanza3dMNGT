import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildApp } from '../src/app.js';
import { resetTestDatabase } from './helpers/testApp.js';
import { prisma } from '../src/db/client.js';

beforeEach(resetTestDatabase);

async function loggedInAgent(app: ReturnType<typeof buildApp>) {
  const email = 'jane@acmeprints.co.za';
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

test('customer endpoints require auth', async () => {
  const app = buildApp();
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

  const getAfterUpdate = await agent.get(`/api/customers/${customerId}`);
  assert.equal(getAfterUpdate.body.customer.notes, 'Prefers matte finish');
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
