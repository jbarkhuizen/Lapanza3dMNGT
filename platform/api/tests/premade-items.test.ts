import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildApp } from '../src/app.js';
import { buildMinimalApp, loggedInAgent, resetTestDatabase } from './helpers/testApp.js';
import { premadeItemsRouter } from '../src/routes/premade-items.js';

beforeEach(resetTestDatabase);

test('premade item endpoints require auth', async () => {
  const app = buildMinimalApp(premadeItemsRouter);
  const res = await request(app).get('/api/premade-items');
  assert.equal(res.status, 401);
});

test('POST /api/premade-items rejects a missing required field', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const res = await agent.post('/api/premade-items').send({ name: 'Keychain blank' });
  assert.equal(res.status, 400);
});

test('full create -> list -> update -> delete cycle', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);

  const createRes = await agent.post('/api/premade-items').send({
    name: 'Keychain blank',
    unitCost: 25,
    costMultiplier: 1,
  });
  assert.equal(createRes.status, 201);
  const id = createRes.body.premadeItem.id;

  const listRes = await agent.get('/api/premade-items');
  assert.equal(listRes.body.premadeItems.length, 1);

  const updateRes = await agent.patch(`/api/premade-items/${id}`).send({ unitCost: 30 });
  assert.equal(updateRes.status, 200);

  const getRes = await agent.get(`/api/premade-items/${id}`);
  assert.equal(getRes.body.premadeItem.unitCost, 30);

  const deleteRes = await agent.delete(`/api/premade-items/${id}`);
  assert.equal(deleteRes.status, 200);

  const getAfterDeleteRes = await agent.get(`/api/premade-items/${id}`);
  assert.equal(getAfterDeleteRes.status, 404);
});

test('tenant isolation: one tenant cannot see, update, or delete another tenant\'s premade item', async () => {
  const app = buildApp();
  const agentA = await loggedInAgent(app, 'jane@acmeprints.co.za');
  const createRes = await agentA.post('/api/premade-items').send({ name: 'Keychain blank', unitCost: 25 });
  const id = createRes.body.premadeItem.id;

  const agentB = await loggedInAgent(app, 'bob@othershop.co.za');
  const getRes = await agentB.get(`/api/premade-items/${id}`);
  assert.equal(getRes.status, 404);

  const updateRes = await agentB.patch(`/api/premade-items/${id}`).send({ unitCost: 1 });
  assert.equal(updateRes.status, 404);

  const deleteRes = await agentB.delete(`/api/premade-items/${id}`);
  assert.equal(deleteRes.status, 404);

  const listRes = await agentB.get('/api/premade-items');
  assert.equal(listRes.body.premadeItems.length, 0);
});
