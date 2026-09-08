import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import { buildApp } from '../src/app.js';
import { resetTestDatabase } from './helpers/testApp.js';
import { prisma } from '../src/db/client.js';
import { filamentsRouter } from '../src/routes/filaments.js';

beforeEach(resetTestDatabase);

function buildMinimalApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(filamentsRouter);
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

test('filament endpoints require auth', async () => {
  const app = buildMinimalApp();
  const res = await request(app).get('/api/filaments');
  assert.equal(res.status, 401);
});

test('POST /api/filaments rejects an invalid diameter', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const res = await agent.post('/api/filaments').send({
    brand: 'eSun',
    materialType: 'PLA',
    diameterMm: 3.0,
  });
  assert.equal(res.status, 400);
});

test('POST /api/filaments rejects a malformed purchaseDate', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const res = await agent.post('/api/filaments').send({
    brand: 'eSun',
    materialType: 'PLA',
    diameterMm: 1.75,
    purchaseDate: 'not-a-date',
  });
  assert.equal(res.status, 400);
});

test('full create -> list -> get -> update cycle', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);

  const createRes = await agent.post('/api/filaments').send({
    brand: 'eSun',
    materialType: 'PLA',
    colour: 'Black',
    diameterMm: 1.75,
    costPerKg: 350,
    spoolWeightGrams: 1000,
    remainingWeightGrams: 1000,
  });
  assert.equal(createRes.status, 201);
  const filamentId = createRes.body.filament.id;

  const listRes = await agent.get('/api/filaments');
  assert.equal(listRes.status, 200);
  assert.equal(listRes.body.filaments.length, 1);

  const updateRes = await agent
    .patch(`/api/filaments/${filamentId}`)
    .send({ remainingWeightGrams: 640 });
  assert.equal(updateRes.status, 200);

  const getRes = await agent.get(`/api/filaments/${filamentId}`);
  assert.equal(getRes.body.filament.remainingWeightGrams, 640);
});
