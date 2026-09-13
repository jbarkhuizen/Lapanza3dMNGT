import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildApp } from '../src/app.js';
import { buildMinimalApp, loggedInAgent, resetTestDatabase } from './helpers/testApp.js';
import { productsRouter } from '../src/routes/products.js';

beforeEach(resetTestDatabase);

test('product endpoints require auth', async () => {
  const app = buildMinimalApp(productsRouter);
  const res = await request(app).get('/api/products');
  assert.equal(res.status, 401);
});

test('POST /api/products rejects a missing required field', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const res = await agent.post('/api/products').send({ name: 'Keychain' });
  assert.equal(res.status, 400);
});

test('full create -> list -> update -> delete cycle', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);

  const createRes = await agent.post('/api/products').send({
    name: 'Engraved keychain',
    category: 'Laser',
    cost: 30,
    sellingPrice: 75,
  });
  assert.equal(createRes.status, 201);
  const product = createRes.body.product;
  assert.equal(product.cost, '30.00');
  assert.equal(product.sellingPrice, '75.00');
  const id = product.id;

  const listRes = await agent.get('/api/products');
  assert.equal(listRes.body.products.length, 1);

  const updateRes = await agent.patch(`/api/products/${id}`).send({ sellingPrice: 80 });
  assert.equal(updateRes.status, 200);

  const getRes = await agent.get(`/api/products/${id}`);
  assert.equal(getRes.body.product.sellingPrice, '80.00');

  const clearCategoryRes = await agent.patch(`/api/products/${id}`).send({ category: null });
  assert.equal(clearCategoryRes.status, 200);
  const afterClearRes = await agent.get(`/api/products/${id}`);
  assert.equal(afterClearRes.body.product.category, null);

  const deleteRes = await agent.delete(`/api/products/${id}`);
  assert.equal(deleteRes.status, 200);

  const getAfterDeleteRes = await agent.get(`/api/products/${id}`);
  assert.equal(getAfterDeleteRes.status, 404);
});

test('tenant isolation: one tenant cannot see, update, or delete another tenant\'s product', async () => {
  const app = buildApp();
  const agentA = await loggedInAgent(app, 'jane@acmeprints.co.za');
  const createRes = await agentA.post('/api/products').send({ name: 'Engraved keychain', cost: 30, sellingPrice: 75 });
  const id = createRes.body.product.id;

  const agentB = await loggedInAgent(app, 'bob@othershop.co.za');
  const getRes = await agentB.get(`/api/products/${id}`);
  assert.equal(getRes.status, 404);

  const updateRes = await agentB.patch(`/api/products/${id}`).send({ sellingPrice: 1 });
  assert.equal(updateRes.status, 404);

  const deleteRes = await agentB.delete(`/api/products/${id}`);
  assert.equal(deleteRes.status, 404);

  const listRes = await agentB.get('/api/products');
  assert.equal(listRes.body.products.length, 0);
});
