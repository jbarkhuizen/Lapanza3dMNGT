import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import { buildApp } from '../src/app.js';
import { resetTestDatabase } from './helpers/testApp.js';
import { prisma } from '../src/db/client.js';
import { printersRouter } from '../src/routes/printers.js';

beforeEach(resetTestDatabase);

function buildMinimalApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(printersRouter);
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

test('printer endpoints require auth', async () => {
  const app = buildMinimalApp();
  const res = await request(app).get('/api/printers');
  assert.equal(res.status, 401);
});

test('POST /api/printers rejects a missing required field', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const res = await agent.post('/api/printers').send({});
  assert.equal(res.status, 400);
});

test('POST /api/printers rejects a malformed purchaseDate', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const res = await agent.post('/api/printers').send({ name: 'P2', purchaseDate: 'not-a-date' });
  assert.equal(res.status, 400);
});

test('full create -> list -> get -> update cycle', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);

  const createRes = await agent.post('/api/printers').send({
    name: 'Printer 1 — Ender 3 V2',
    make: 'Creality',
    model: 'Ender 3 V2',
    buildVolumeXMm: 220,
    buildVolumeYMm: 220,
    buildVolumeZMm: 250,
    powerDrawWatts: 360,
  });
  assert.equal(createRes.status, 201);
  assert.equal(createRes.body.printer.status, 'active');
  const printerId = createRes.body.printer.id;

  const listRes = await agent.get('/api/printers');
  assert.equal(listRes.status, 200);
  assert.equal(listRes.body.printers.length, 1);

  const getRes = await agent.get(`/api/printers/${printerId}`);
  assert.equal(getRes.status, 200);
  assert.equal(getRes.body.printer.make, 'Creality');

  const updateRes = await agent.patch(`/api/printers/${printerId}`).send({ status: 'maintenance' });
  assert.equal(updateRes.status, 200);

  const getAfterUpdate = await agent.get(`/api/printers/${printerId}`);
  assert.equal(getAfterUpdate.body.printer.status, 'maintenance');
});

test('GET /api/printers/:id returns 404 for another tenant\'s printer', async () => {
  const app = buildApp();
  const agentA = await loggedInAgent(app, 'jane@acmeprints.co.za');
  const agentB = await loggedInAgent(app, 'bob@othershop.co.za');

  const createRes = await agentA.post('/api/printers').send({ name: 'Printer 1' });
  const res = await agentB.get(`/api/printers/${createRes.body.printer.id}`);
  assert.equal(res.status, 404);
});

test('create and update round-trip electricityRatePerKwh and expectedLifetimeHours', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);

  const createRes = await agent.post('/api/printers').send({
    name: 'Printer 1',
    purchaseCost: 4000,
    electricityRatePerKwh: 2.5,
    expectedLifetimeHours: 2000,
  });
  assert.equal(createRes.status, 201);
  assert.equal(createRes.body.printer.electricityRatePerKwh, '2.5000');
  assert.equal(createRes.body.printer.expectedLifetimeHours, 2000);
  const printerId = createRes.body.printer.id;

  const updateRes = await agent
    .patch(`/api/printers/${printerId}`)
    .send({ electricityRatePerKwh: 3.1 });
  assert.equal(updateRes.status, 200);

  const getRes = await agent.get(`/api/printers/${printerId}`);
  assert.equal(getRes.body.printer.electricityRatePerKwh, '3.1000');
});

test('POST /api/printers rejects a negative electricityRatePerKwh', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const res = await agent.post('/api/printers').send({
    name: 'Printer 1',
    electricityRatePerKwh: -1,
  });
  assert.equal(res.status, 400);
});
