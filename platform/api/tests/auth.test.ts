import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildApp } from '../src/app.js';
import { resetTestDatabase } from './helpers/testApp.js';
import { prisma } from '../src/db/client.js';

beforeEach(resetTestDatabase);

test('POST /api/auth/register creates an unverified tenant', async () => {
  const app = buildApp();
  const res = await request(app).post('/api/auth/register').send({
    businessName: 'Acme Prints',
    contactName: 'Jane Doe',
    email: 'jane@acmeprints.co.za',
    password: 'correct horse battery staple',
  });

  assert.equal(res.status, 201);
  assert.equal(res.body.ok, true);

  const tenant = await prisma.tenant.findUnique({
    where: { email: 'jane@acmeprints.co.za' },
  });
  assert.ok(tenant, 'tenant row should exist');
  assert.equal(tenant?.emailVerifiedAt, null);
  assert.notEqual(tenant?.passwordHash, 'correct horse battery staple');
});

test('POST /api/auth/register rejects a duplicate email', async () => {
  const app = buildApp();
  const payload = {
    businessName: 'Acme Prints',
    contactName: 'Jane Doe',
    email: 'jane@acmeprints.co.za',
    password: 'correct horse battery staple',
  };
  await request(app).post('/api/auth/register').send(payload);
  const res = await request(app).post('/api/auth/register').send(payload);

  assert.equal(res.status, 409);
  assert.equal(res.body.ok, false);
});

test('POST /api/auth/register handles a concurrent duplicate registration race', async () => {
  const app = buildApp();
  const payload = {
    businessName: 'Acme Prints',
    contactName: 'Jane Doe',
    email: 'race@acmeprints.co.za',
    password: 'correct horse battery staple',
  };

  const [first, second] = await Promise.all([
    request(app).post('/api/auth/register').send(payload),
    request(app).post('/api/auth/register').send(payload),
  ]);

  const statuses = [first.status, second.status].sort();
  assert.deepEqual(statuses, [201, 409]);

  const winner = first.status === 201 ? first : second;
  const loser = first.status === 201 ? second : first;
  assert.equal(winner.body.ok, true);
  assert.equal(loser.body.ok, false);
  assert.equal(loser.body.error, 'An account with this email already exists.');
});

test('POST /api/auth/register rejects a missing required field', async () => {
  const app = buildApp();
  const res = await request(app).post('/api/auth/register').send({
    businessName: 'Acme Prints',
    email: 'jane@acmeprints.co.za',
    password: 'correct horse battery staple',
  });

  assert.equal(res.status, 400);
  assert.equal(res.body.ok, false);
});

test('POST /api/auth/verify-email verifies a valid token', async () => {
  const app = buildApp();
  await request(app).post('/api/auth/register').send({
    businessName: 'Acme Prints',
    contactName: 'Jane Doe',
    email: 'jane@acmeprints.co.za',
    password: 'correct horse battery staple',
  });
  const tenant = await prisma.tenant.findUnique({ where: { email: 'jane@acmeprints.co.za' } });

  const res = await request(app)
    .post('/api/auth/verify-email')
    .send({ token: tenant?.verificationToken });

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);

  const updated = await prisma.tenant.findUnique({ where: { email: 'jane@acmeprints.co.za' } });
  assert.ok(updated?.emailVerifiedAt, 'emailVerifiedAt should be set');
});

test('POST /api/auth/verify-email rejects an unknown token', async () => {
  const app = buildApp();
  const res = await request(app)
    .post('/api/auth/verify-email')
    .send({ token: 'not-a-real-token' });

  assert.equal(res.status, 400);
  assert.equal(res.body.ok, false);
});
