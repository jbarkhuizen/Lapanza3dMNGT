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

test('printer endpoints require auth', async () => {
  const app = buildApp();
  const res = await request(app).get('/api/printers');
  assert.equal(res.status, 401);
});

test('POST /api/printers rejects a missing required field', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const res = await agent.post('/api/printers').send({});
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
