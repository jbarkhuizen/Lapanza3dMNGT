import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import { buildApp } from '../src/app.js';
import { resetTestDatabase } from './helpers/testApp.js';
import { prisma } from '../src/db/client.js';
import { labourStepsRouter } from '../src/routes/labour-steps.js';

beforeEach(resetTestDatabase);

function buildMinimalApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(labourStepsRouter);
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

test('labour step endpoints require auth', async () => {
  const app = buildMinimalApp();
  const res = await request(app).get('/api/labour-steps');
  assert.equal(res.status, 401);
});

test('POST /api/labour-steps rejects a missing hourly rate', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const res = await agent.post('/api/labour-steps').send({ name: 'Slicing & setup' });
  assert.equal(res.status, 400);
});

test('full create -> list -> update cycle, defaults active to true', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);

  const createRes = await agent.post('/api/labour-steps').send({
    name: 'Slicing & setup',
    hourlyRate: 150,
  });
  assert.equal(createRes.status, 201);
  assert.equal(createRes.body.labourStep.active, true);
  const id = createRes.body.labourStep.id;

  const listRes = await agent.get('/api/labour-steps');
  assert.equal(listRes.body.labourSteps.length, 1);

  const updateRes = await agent.patch(`/api/labour-steps/${id}`).send({ active: false });
  assert.equal(updateRes.status, 200);

  const getRes = await agent.get(`/api/labour-steps/${id}`);
  assert.equal(getRes.body.labourStep.active, false);
});
