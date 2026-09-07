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

async function loggedInAgentWithPrinter(app: ReturnType<typeof buildApp>, email = 'jane@acmeprints.co.za') {
  const agent = await loggedInAgent(app, email);
  const printerRes = await agent.post('/api/printers').send({ name: 'Printer 1' });
  return { agent, printerId: printerRes.body.printer.id as string };
}

test('maintenance log endpoints require auth', async () => {
  const app = buildApp();
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

test('returns 404 for a printer belonging to another tenant', async () => {
  const app = buildApp();
  const { printerId } = await loggedInAgentWithPrinter(app, 'jane@acmeprints.co.za');
  const agentB = await loggedInAgent(app, 'bob@othershop.co.za');

  const res = await agentB.get(`/api/printers/${printerId}/maintenance-log`);
  assert.equal(res.status, 404);
});
