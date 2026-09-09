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

test('GET /api/admin/tenants lists tenants with subscription status', async () => {
  const passwordHash = await hashPassword('irrelevant password value');
  await prisma.tenant.create({
    data: { businessName: 'Acme Prints', contactName: 'Jane', email: 'jane@acmeprints.co.za', passwordHash },
  });
  const agent = await loggedInAdminAgent();
  const res = await agent.get('/api/admin/tenants');
  assert.equal(res.status, 200);
  assert.match(res.text, /Acme Prints/);
  assert.match(res.text, /jane@acmeprints\.co\.za/);
  assert.match(res.text, /None/); // no subscription yet
});

test('GET /api/admin/tenants/:id shows tenant detail with an edit form pre-filled', async () => {
  const passwordHash = await hashPassword('irrelevant password value');
  const tenant = await prisma.tenant.create({
    data: { businessName: 'Acme Prints', contactName: 'Jane Doe', email: 'jane@acmeprints.co.za', passwordHash },
  });
  const agent = await loggedInAdminAgent();
  const res = await agent.get(`/api/admin/tenants/${tenant.id}`);
  assert.equal(res.status, 200);
  assert.match(res.text, /value="Acme Prints"/);
  assert.match(res.text, /value="Jane Doe"/);
  assert.match(res.text, /value="jane@acmeprints\.co\.za"/);
});

test('GET /api/admin/tenants/:id 404s for an unknown id', async () => {
  const agent = await loggedInAdminAgent();
  const res = await agent.get('/api/admin/tenants/does-not-exist');
  assert.equal(res.status, 404);
});

test('POST /api/admin/tenants/:id/edit updates exactly that tenant, not others', async () => {
  const passwordHash = await hashPassword('irrelevant password value');
  const tenantA = await prisma.tenant.create({
    data: { businessName: 'Acme Prints', contactName: 'Jane', email: 'jane@acmeprints.co.za', passwordHash },
  });
  const tenantB = await prisma.tenant.create({
    data: { businessName: 'Other Co', contactName: 'Bob', email: 'bob@other.co.za', passwordHash },
  });
  const agent = await loggedInAdminAgent();
  const res = await agent.post(`/api/admin/tenants/${tenantA.id}/edit`).send({
    businessName: 'Acme 3D Prints', contactName: 'Jane Smith', email: 'jane.smith@acmeprints.co.za',
  });
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, `/api/admin/tenants/${tenantA.id}`);

  const updatedA = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantA.id } });
  assert.equal(updatedA.businessName, 'Acme 3D Prints');
  assert.equal(updatedA.contactName, 'Jane Smith');
  assert.equal(updatedA.email, 'jane.smith@acmeprints.co.za');

  const untouchedB = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantB.id } });
  assert.equal(untouchedB.businessName, 'Other Co');
});

test('admin tenant routes require a platform-admin session', async () => {
  const res1 = await request(app).get('/api/admin/tenants');
  assert.equal(res1.status, 302);
  const res2 = await request(app).post('/api/admin/tenants/some-id/edit').send({ businessName: 'x' });
  assert.equal(res2.status, 302);
});
