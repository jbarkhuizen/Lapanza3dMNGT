import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildApp } from '../src/app.js';
import { buildMinimalApp, loggedInAgent, resetTestDatabase } from './helpers/testApp.js';
import { laserMaterialsRouter } from '../src/routes/laser-materials.js';

beforeEach(resetTestDatabase);

test('laser material endpoints require auth', async () => {
  const app = buildMinimalApp(laserMaterialsRouter);
  const res = await request(app).get('/api/laser-materials');
  assert.equal(res.status, 401);
});

test('POST /api/laser-materials rejects a missing required field', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const res = await agent.post('/api/laser-materials').send({ name: 'Acrylic 3mm' });
  assert.equal(res.status, 400);
});

test('full create -> list -> update -> delete cycle', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);

  const createRes = await agent.post('/api/laser-materials').send({
    name: 'Acrylic 3mm',
    sheetPrice: 500,
    sheetAreaM2: 2.88,
    usableSheetAreaM2: 2,
    costMultiplier: 1,
  });
  assert.equal(createRes.status, 201);
  const id = createRes.body.laserMaterial.id;

  const listRes = await agent.get('/api/laser-materials');
  assert.equal(listRes.body.laserMaterials.length, 1);

  const updateRes = await agent.patch(`/api/laser-materials/${id}`).send({ sheetPrice: 550 });
  assert.equal(updateRes.status, 200);

  const getRes = await agent.get(`/api/laser-materials/${id}`);
  assert.equal(getRes.body.laserMaterial.sheetPrice, 550);

  const deleteRes = await agent.delete(`/api/laser-materials/${id}`);
  assert.equal(deleteRes.status, 200);

  const getAfterDeleteRes = await agent.get(`/api/laser-materials/${id}`);
  assert.equal(getAfterDeleteRes.status, 404);
});

test('tenant isolation: one tenant cannot see, update, or delete another tenant\'s laser material', async () => {
  const app = buildApp();
  const agentA = await loggedInAgent(app, 'jane@acmeprints.co.za');
  const createRes = await agentA.post('/api/laser-materials').send({
    name: 'Acrylic 3mm', sheetPrice: 500, sheetAreaM2: 2.88, usableSheetAreaM2: 2,
  });
  const id = createRes.body.laserMaterial.id;

  const agentB = await loggedInAgent(app, 'bob@othershop.co.za');
  const getRes = await agentB.get(`/api/laser-materials/${id}`);
  assert.equal(getRes.status, 404);

  const updateRes = await agentB.patch(`/api/laser-materials/${id}`).send({ sheetPrice: 1 });
  assert.equal(updateRes.status, 404);

  const deleteRes = await agentB.delete(`/api/laser-materials/${id}`);
  assert.equal(deleteRes.status, 404);

  const listRes = await agentB.get('/api/laser-materials');
  assert.equal(listRes.body.laserMaterials.length, 0);
});
