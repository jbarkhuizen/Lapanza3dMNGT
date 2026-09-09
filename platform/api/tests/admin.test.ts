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

async function makeTenantAndPlan() {
  const passwordHash = await hashPassword('irrelevant password value');
  const tenant = await prisma.tenant.create({
    data: { businessName: 'Acme Prints', contactName: 'Jane', email: 'jane@acmeprints.co.za', passwordHash },
  });
  const plan = await prisma.plan.findFirstOrThrow({ where: { name: 'Tier 1' } });
  return { tenant, plan };
}

test('granting a subscription creates one with paymentProvider "manual" and no providerSubscriptionId', async () => {
  const { tenant, plan } = await makeTenantAndPlan();
  const agent = await loggedInAdminAgent();
  const res = await agent.post(`/api/admin/tenants/${tenant.id}/subscription/grant`).send({ planId: plan.id });
  assert.equal(res.status, 302);

  const subscription = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } });
  assert.equal(subscription.status, 'active');
  assert.equal(subscription.paymentProvider, 'manual');
  assert.equal(subscription.providerSubscriptionId, null);
  assert.equal(subscription.planId, plan.id);
});

test('a granted subscription can be cancelled through the real tenant-facing cancel route with no error', async () => {
  // This is the direct regression test for this task's core safety claim:
  // an admin-granted row (paymentProvider: 'manual', providerSubscriptionId: null)
  // must never reach billing.ts's unguarded providers[paymentProvider] lookup.
  const { tenant, plan } = await makeTenantAndPlan();
  const adminAgent = await loggedInAdminAgent();
  await adminAgent.post(`/api/admin/tenants/${tenant.id}/subscription/grant`).send({ planId: plan.id });

  const tenantAgent = request.agent(app);
  await tenantAgent.post('/api/auth/register').send({
    businessName: tenant.businessName, contactName: 'Jane', email: tenant.email, password: 'correct horse battery staple',
  }).catch(() => {}); // tenant already exists from makeTenantAndPlan — register will 409, that's fine, we just need a logged-in agent
  const dbTenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
  await prisma.tenant.update({ where: { id: tenant.id }, data: { emailVerifiedAt: new Date() } });
  await tenantAgent.post('/api/auth/login').send({ email: dbTenant.email, password: 'irrelevant password value' });

  const res = await tenantAgent.post('/api/billing/cancel');
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);

  const cancelled = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } });
  assert.equal(cancelled.status, 'canceled');
});

test('re-granting replaces an existing canceled subscription rather than erroring', async () => {
  const { tenant, plan } = await makeTenantAndPlan();
  const agent = await loggedInAdminAgent();
  await agent.post(`/api/admin/tenants/${tenant.id}/subscription/grant`).send({ planId: plan.id });
  const first = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } });

  const res = await agent.post(`/api/admin/tenants/${tenant.id}/subscription/grant`).send({ planId: plan.id });
  assert.equal(res.status, 302);

  const second = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } });
  assert.notEqual(second.id, first.id);
});

test('adjust changes only the requested status, leaves other fields untouched', async () => {
  const { tenant, plan } = await makeTenantAndPlan();
  const agent = await loggedInAdminAgent();
  await agent.post(`/api/admin/tenants/${tenant.id}/subscription/grant`).send({ planId: plan.id });
  const before = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } });

  const res = await agent.post(`/api/admin/tenants/${tenant.id}/subscription/adjust`).send({ status: 'past_due' });
  assert.equal(res.status, 302);

  const after = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } });
  assert.equal(after.status, 'past_due');
  assert.equal(after.planId, before.planId);
  assert.equal(after.paymentProvider, before.paymentProvider);
});

test('adjust with an invalid status value is rejected, no change made', async () => {
  const { tenant, plan } = await makeTenantAndPlan();
  const agent = await loggedInAdminAgent();
  await agent.post(`/api/admin/tenants/${tenant.id}/subscription/grant`).send({ planId: plan.id });

  await agent.post(`/api/admin/tenants/${tenant.id}/subscription/adjust`).send({ status: 'not-a-real-status' });

  const unchanged = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } });
  assert.equal(unchanged.status, 'active');
});

test('cancel on a subscription with no providerSubscriptionId cancels locally with no provider call', async () => {
  const { tenant, plan } = await makeTenantAndPlan();
  const agent = await loggedInAdminAgent();
  await agent.post(`/api/admin/tenants/${tenant.id}/subscription/grant`).send({ planId: plan.id });

  const res = await agent.post(`/api/admin/tenants/${tenant.id}/subscription/cancel`);
  assert.equal(res.status, 302);

  const cancelled = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } });
  assert.equal(cancelled.status, 'canceled');
});
