import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/db/client.js';
import { hashPassword } from '../src/auth/password.js';
import { resetTestDatabase } from './helpers/testApp.js';

const app = buildApp();

beforeEach(resetTestDatabase);

async function makeAdmin(email = 'admin@barkie.co.za', password = 'correct horse battery staple') {
  const passwordHash = await hashPassword(password);
  return prisma.platformAdmin.create({ data: { email, passwordHash } });
}

async function loggedInAdminAgent(email = 'admin@barkie.co.za', password = 'correct horse battery staple') {
  await makeAdmin(email, password);
  const agent = request.agent(app);
  await agent.post('/api/admin/login').send({ email, password });
  return agent;
}

test('GET /api/admin without a session redirects to login', async () => {
  const res = await request(app).get('/api/admin');
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, '/api/admin/login');
});

test('GET /api/admin/login renders without requiring auth', async () => {
  const res = await request(app).get('/api/admin/login');
  assert.equal(res.status, 200);
  assert.match(res.text, /Barkie Admin/);
});

test('POST /api/admin/login with wrong password redirects back with an error, does not set a session', async () => {
  await makeAdmin();
  const res = await request(app).post('/api/admin/login').send({ email: 'admin@barkie.co.za', password: 'wrong' });
  assert.equal(res.status, 302);
  assert.match(res.headers.location, /\/api\/admin\/login\?error=1/);
  assert.equal(res.headers['set-cookie'], undefined);
});

test('POST /api/admin/login with correct credentials sets a session and grants access', async () => {
  const agent = await loggedInAdminAgent();
  const res = await agent.get('/api/admin');
  assert.equal(res.status, 200);
  assert.match(res.text, /Dashboard/);
});

test('a tenant session cannot access /api/admin routes', async () => {
  const passwordHash = await hashPassword('irrelevant password value');
  await prisma.tenant.create({
    data: {
      businessName: 'Acme', contactName: 'Jane', email: 'jane@acmeprints.co.za',
      passwordHash, emailVerifiedAt: new Date(),
    },
  });
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: 'jane@acmeprints.co.za', password: 'irrelevant password value' });
  const res = await agent.get('/api/admin');
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, '/api/admin/login');
});

test('POST /api/admin/logout destroys the session', async () => {
  const agent = await loggedInAdminAgent();
  await agent.post('/api/admin/logout');
  const res = await agent.get('/api/admin');
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, '/api/admin/login');
});
