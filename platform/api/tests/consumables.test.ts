import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildApp } from '../src/app.js';
import { buildMinimalApp, loggedInAgent, resetTestDatabase } from './helpers/testApp.js';
import { consumablesRouter } from '../src/routes/consumables.js';

beforeEach(resetTestDatabase);

test('consumable endpoints require auth', async () => {
  const app = buildMinimalApp(consumablesRouter);
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
