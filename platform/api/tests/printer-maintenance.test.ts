import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import { buildApp } from '../src/app.js';
import { resetTestDatabase } from './helpers/testApp.js';
import { prisma } from '../src/db/client.js';
import { printerMaintenanceRouter } from '../src/routes/printer-maintenance.js';

beforeEach(resetTestDatabase);

function buildMinimalApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(printerMaintenanceRouter);
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

async function loggedInAgentWithPrinter(app: ReturnType<typeof buildApp>, email = 'jane@acmeprints.co.za') {
  const agent = await loggedInAgent(app, email);
  const printerRes = await agent.post('/api/printers').send({ name: 'Printer 1' });
  return { agent, printerId: printerRes.body.printer.id as string };
}

test('maintenance log endpoints require auth', async () => {
  const app = buildMinimalApp();
  const res = await request(app).get('/api/printers/does-not-matter/maintenance-log');
  assert.equal(res.status, 401);
});

test('create -> list cycle', async () => {
  const app = buildApp();
  const { agent, printerId } = await loggedInAgentWithPrinter(app);

  const createRes = await agent.post(`/api/printers/${printerId}/maintenance-log`).send({
    date: '2026-09-01',
    description: 'Replaced nozzle',
    cost: 150,
    performedBy: 'Jane',
  });
  assert.equal(createRes.status, 201);

  const listRes = await agent.get(`/api/printers/${printerId}/maintenance-log`);
  assert.equal(listRes.status, 200);
  assert.equal(listRes.body.entries.length, 1);
  assert.equal(listRes.body.entries[0].description, 'Replaced nozzle');
});

test('POST rejects a missing required field', async () => {
  const app = buildApp();
  const { agent, printerId } = await loggedInAgentWithPrinter(app);
  const res = await agent.post(`/api/printers/${printerId}/maintenance-log`).send({ cost: 50 });
  assert.equal(res.status, 400);
});

test('POST rejects a malformed date', async () => {
  const app = buildApp();
  const { agent, printerId } = await loggedInAgentWithPrinter(app);
  const res = await agent.post(`/api/printers/${printerId}/maintenance-log`).send({
    date: 'not-a-date',
    description: 'Replaced nozzle',
  });
  assert.equal(res.status, 400);
});

test('returns 404 for a printer belonging to another tenant', async () => {
  const app = buildApp();
  const { printerId } = await loggedInAgentWithPrinter(app, 'jane@acmeprints.co.za');
  const agentB = await loggedInAgent(app, 'bob@othershop.co.za');

  const res = await agentB.get(`/api/printers/${printerId}/maintenance-log`);
  assert.equal(res.status, 404);
});
