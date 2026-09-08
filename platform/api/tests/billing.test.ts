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

test('GET /api/plans requires auth', async () => {
  const app = buildApp();
  const res = await request(app).get('/api/plans');
  assert.equal(res.status, 401);
});

test('GET /api/plans lists the 3 seeded plans, ordered by sortOrder', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const res = await agent.get('/api/plans');
  assert.equal(res.status, 200);
  assert.equal(res.body.plans.length, 3);
  assert.deepEqual(
    res.body.plans.map((p: { name: string }) => p.name),
    ['Tier 1', 'Tier 2', 'Tier 3'],
  );
});

test('GET /api/billing/subscription returns null when the tenant has no subscription yet', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const res = await agent.get('/api/billing/subscription');
  assert.equal(res.status, 200);
  assert.equal(res.body.subscription, null);
});

test('POST /api/billing/checkout rejects an unknown provider', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const plan = await prisma.plan.findFirstOrThrow({ where: { name: 'Tier 1' } });
  const res = await agent.post('/api/billing/checkout').send({ planId: plan.id, provider: 'not-a-real-provider' });
  assert.equal(res.status, 400);
});

test('POST /api/billing/checkout rejects an unknown planId', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const res = await agent.post('/api/billing/checkout').send({ planId: 'does-not-exist', provider: 'payfast' });
  assert.equal(res.status, 400);
});
