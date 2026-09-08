import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import { buildApp } from '../src/app.js';
import { resetTestDatabase } from './helpers/testApp.js';
import { prisma } from '../src/db/client.js';
import { consumablesRouter } from '../src/routes/consumables.js';

beforeEach(resetTestDatabase);

function buildMinimalApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(consumablesRouter);
  return app;
}

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

test('consumable endpoints require auth', async () => {
  const app = buildMinimalApp();
  const res = await request(app).get('/api/consumables');
  assert.equal(res.status, 401);
});

test('POST /api/consumables rejects an invalid category', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const res = await agent.post('/api/consumables').send({
    name: 'Isopropyl alcohol',
    category: 'not-a-real-category',
    unitOfMeasure: 'ml',
    costPerUnit: 0.5,
  });
  assert.equal(res.status, 400);
});

test('full create -> list -> update cycle', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);

  const createRes = await agent.post('/api/consumables').send({
    name: 'Build plate adhesive',
    category: 'build-plate-adhesive',
    unitOfMeasure: 'each',
    costPerUnit: 45,
    currentStock: 10,
    reorderThreshold: 2,
  });
  assert.equal(createRes.status, 201);
  const id = createRes.body.consumable.id;

  const listRes = await agent.get('/api/consumables');
  assert.equal(listRes.body.consumables.length, 1);

  const updateRes = await agent.patch(`/api/consumables/${id}`).send({ currentStock: 8 });
  assert.equal(updateRes.status, 200);

  const getRes = await agent.get(`/api/consumables/${id}`);
  assert.equal(getRes.body.consumable.currentStock, 8);
});
