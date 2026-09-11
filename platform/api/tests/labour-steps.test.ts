import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildApp } from '../src/app.js';
import { buildMinimalApp, loggedInAgent, resetTestDatabase } from './helpers/testApp.js';
import { labourStepsRouter } from '../src/routes/labour-steps.js';

beforeEach(resetTestDatabase);

test('labour step endpoints require auth', async () => {
  const app = buildMinimalApp(labourStepsRouter);
  const res = await request(app).get('/api/labour-steps');
  assert.equal(res.status, 401);
});

test('POST /api/labour-steps rejects a missing hourly rate', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const res = await agent.post('/api/labour-steps').send({ name: 'Slicing & setup' });
  assert.equal(res.status, 400);
});

test('full create -> list -> update cycle, defaults active to true', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);

  const createRes = await agent.post('/api/labour-steps').send({
    name: 'Slicing & setup',
    hourlyRate: 150,
  });
  assert.equal(createRes.status, 201);
  assert.equal(createRes.body.labourStep.active, true);
  const id = createRes.body.labourStep.id;

  const listRes = await agent.get('/api/labour-steps');
  assert.equal(listRes.body.labourSteps.length, 1);

  const updateRes = await agent.patch(`/api/labour-steps/${id}`).send({ active: false });
  assert.equal(updateRes.status, 200);

  const getRes = await agent.get(`/api/labour-steps/${id}`);
  assert.equal(getRes.body.labourStep.active, false);
});
