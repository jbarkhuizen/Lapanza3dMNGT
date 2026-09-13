import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildApp } from '../src/app.js';
import { buildMinimalApp, loggedInAgent, resetTestDatabase } from './helpers/testApp.js';
import { scannersRouter } from '../src/routes/scanners.js';

beforeEach(resetTestDatabase);

test('scanner endpoints require auth', async () => {
  const app = buildMinimalApp(scannersRouter);
  const res = await request(app).get('/api/scanners');
  assert.equal(res.status, 401);
});

test('POST /api/scanners rejects a missing required field', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const res = await agent.post('/api/scanners').send({ name: 'Handheld scanner' });
  assert.equal(res.status, 400);
});

test('full create -> list -> update -> delete cycle', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);

  const createRes = await agent.post('/api/scanners').send({
    name: 'Handheld scanner',
    scannerCost: 6000,
    expectedScanHours: 1000,
    powerCostPerHour: 0.5,
  });
  assert.equal(createRes.status, 201);
  const id = createRes.body.scanner.id;

  const listRes = await agent.get('/api/scanners');
  assert.equal(listRes.body.scanners.length, 1);

  const updateRes = await agent.patch(`/api/scanners/${id}`).send({ scannerCost: 6500 });
  assert.equal(updateRes.status, 200);

  const getRes = await agent.get(`/api/scanners/${id}`);
  assert.equal(getRes.body.scanner.scannerCost, 6500);

  const deleteRes = await agent.delete(`/api/scanners/${id}`);
  assert.equal(deleteRes.status, 200);

  const getAfterDeleteRes = await agent.get(`/api/scanners/${id}`);
  assert.equal(getAfterDeleteRes.status, 404);
});

test('tenant isolation: one tenant cannot see, update, or delete another tenant\'s scanner', async () => {
  const app = buildApp();
  const agentA = await loggedInAgent(app, 'jane@acmeprints.co.za');
  const createRes = await agentA.post('/api/scanners').send({
    name: 'Handheld scanner', scannerCost: 6000, expectedScanHours: 1000,
  });
  const id = createRes.body.scanner.id;

  const agentB = await loggedInAgent(app, 'bob@othershop.co.za');
  const getRes = await agentB.get(`/api/scanners/${id}`);
  assert.equal(getRes.status, 404);

  const updateRes = await agentB.patch(`/api/scanners/${id}`).send({ scannerCost: 1 });
  assert.equal(updateRes.status, 404);

  const deleteRes = await agentB.delete(`/api/scanners/${id}`);
  assert.equal(deleteRes.status, 404);

  const listRes = await agentB.get('/api/scanners');
  assert.equal(listRes.body.scanners.length, 0);
});
