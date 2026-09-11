import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildApp } from '../src/app.js';
import { buildMinimalApp, loggedInAgent, resetTestDatabase } from './helpers/testApp.js';
import { filamentsRouter } from '../src/routes/filaments.js';

beforeEach(resetTestDatabase);

test('filament endpoints require auth', async () => {
  const app = buildMinimalApp(filamentsRouter);
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

test('PATCH /api/filaments/:id can set then clear purchaseDate back to null', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);

  const createRes = await agent.post('/api/filaments').send({
    brand: 'eSun',
    materialType: 'PLA',
    diameterMm: 1.75,
  });
  assert.equal(createRes.status, 201);
  assert.equal(createRes.body.filament.purchaseDate, null);
  const filamentId = createRes.body.filament.id;

  const setRes = await agent
    .patch(`/api/filaments/${filamentId}`)
    .send({ purchaseDate: '2024-01-15' });
  assert.equal(setRes.status, 200);

  const getAfterSet = await agent.get(`/api/filaments/${filamentId}`);
  assert.ok(getAfterSet.body.filament.purchaseDate);

  const clearRes = await agent
    .patch(`/api/filaments/${filamentId}`)
    .send({ purchaseDate: null });
  assert.equal(clearRes.status, 200);

  const getAfterClear = await agent.get(`/api/filaments/${filamentId}`);
  assert.equal(getAfterClear.body.filament.purchaseDate, null);
});

test('PATCH /api/filaments/:id omitting purchaseDate leaves it untouched', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);

  const createRes = await agent.post('/api/filaments').send({
    brand: 'eSun',
    materialType: 'PLA',
    diameterMm: 1.75,
    purchaseDate: '2024-01-15',
  });
  assert.equal(createRes.status, 201);
  const filamentId = createRes.body.filament.id;

  const updateRes = await agent
    .patch(`/api/filaments/${filamentId}`)
    .send({ remainingWeightGrams: 500 });
  assert.equal(updateRes.status, 200);

  const getRes = await agent.get(`/api/filaments/${filamentId}`);
  assert.ok(getRes.body.filament.purchaseDate);
});

// Backlog #47: optional numeric fields (like `purchaseDate` above) must accept an explicit
// `null` on PATCH to actually clear a previously-set value, distinct from omitting the key
// (which must leave it untouched). `costPerKg` stands in for every other optional numeric
// field on this route (`costPerSpool`, `spoolWeightGrams`, `remainingWeightGrams`,
// `lowStockThresholdGrams`), which all share the same three-state handling in scoped.ts.
test('PATCH /api/filaments/:id can set then clear costPerKg back to null', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);

  const createRes = await agent.post('/api/filaments').send({
    brand: 'eSun',
    materialType: 'PLA',
    diameterMm: 1.75,
  });
  assert.equal(createRes.status, 201);
  assert.equal(createRes.body.filament.costPerKg, null);
  const filamentId = createRes.body.filament.id;

  const setRes = await agent
    .patch(`/api/filaments/${filamentId}`)
    .send({ costPerKg: 350 });
  assert.equal(setRes.status, 200);

  const getAfterSet = await agent.get(`/api/filaments/${filamentId}`);
  assert.equal(getAfterSet.body.filament.costPerKg, 350);

  const clearRes = await agent
    .patch(`/api/filaments/${filamentId}`)
    .send({ costPerKg: null });
  assert.equal(clearRes.status, 200);

  const getAfterClear = await agent.get(`/api/filaments/${filamentId}`);
  assert.equal(getAfterClear.body.filament.costPerKg, null);
});

test('PATCH /api/filaments/:id omitting costPerKg leaves it untouched', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);

  const createRes = await agent.post('/api/filaments').send({
    brand: 'eSun',
    materialType: 'PLA',
    diameterMm: 1.75,
    costPerKg: 350,
  });
  assert.equal(createRes.status, 201);
  const filamentId = createRes.body.filament.id;

  const updateRes = await agent
    .patch(`/api/filaments/${filamentId}`)
    .send({ remainingWeightGrams: 500 });
  assert.equal(updateRes.status, 200);

  const getRes = await agent.get(`/api/filaments/${filamentId}`);
  assert.equal(getRes.body.filament.costPerKg, 350);
});
