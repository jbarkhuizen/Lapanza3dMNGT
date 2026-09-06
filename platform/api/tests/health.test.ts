import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/db/client.js';

test('GET /api/health returns ok', async () => {
  const app = buildApp();
  const res = await request(app).get('/api/health');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true, service: 'barkie-api' });
});

test('database connection is alive', async () => {
  const result = await prisma.$queryRaw`SELECT 1 as ok`;
  assert.deepEqual(result, [{ ok: 1 }]);
});
