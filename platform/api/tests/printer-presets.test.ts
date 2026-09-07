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

test('preset endpoints require auth', async () => {
  const app = buildApp();
  const res = await request(app).get('/api/printers/does-not-matter/presets');
  assert.equal(res.status, 401);
});

test('POST /api/printers/:printerId/presets returns 404 for a printer belonging to another tenant', async () => {
  const app = buildApp();
  const { printerId } = await loggedInAgentWithPrinter(app, 'jane@acmeprints.co.za');
  const agentB = await loggedInAgent(app, 'bob@othershop.co.za');

  const res = await agentB.post(`/api/printers/${printerId}/presets`).send({
    name: 'PLA — Standard',
    materialType: 'PLA',
  });
  assert.equal(res.status, 404);
});

test('full create -> list -> update cycle, scoped to the printer', async () => {
  const app = buildApp();
  const { agent, printerId } = await loggedInAgentWithPrinter(app);

  const createRes = await agent.post(`/api/printers/${printerId}/presets`).send({
    name: 'PLA — Standard',
    materialType: 'PLA',
    nozzleTempC: 210,
    bedTempC: 60,
    infillPercent: 20,
  });
  assert.equal(createRes.status, 201);
  const presetId = createRes.body.preset.id;

  const listRes = await agent.get(`/api/printers/${printerId}/presets`);
  assert.equal(listRes.status, 200);
  assert.equal(listRes.body.presets.length, 1);

  const updateRes = await agent
    .patch(`/api/printers/${printerId}/presets/${presetId}`)
    .send({ infillPercent: 35 });
  assert.equal(updateRes.status, 200);

  const listAfterUpdate = await agent.get(`/api/printers/${printerId}/presets`);
  assert.equal(listAfterUpdate.body.presets[0].infillPercent, 35);
});
