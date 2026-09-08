import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { prisma } from '../src/db/client.js';
import { tenantScope } from '../src/db/scoped.js';
import { requireActiveSubscription } from '../src/middleware/requireActiveSubscription.js';
import { resetTestDatabase } from './helpers/testApp.js';

beforeEach(resetTestDatabase);

function buildTestApp(tenantId: string) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.tenantId = tenantId;
    next();
  });
  app.use(requireActiveSubscription);
  app.get('/thing', (_req, res) => res.json({ ok: true }));
  app.post('/thing', (_req, res) => res.json({ ok: true }));
  return app;
}

async function makeTenantWithSubscriptionStatus(status: string, updatedAt?: Date) {
  const tenant = await prisma.tenant.create({
    data: { businessName: 'Acme Prints', contactName: 'Jane Doe', email: `${status}@acmeprints.co.za`, passwordHash: 'x' },
  });
  const plan = await prisma.plan.findFirstOrThrow({ where: { name: 'Tier 1' } });
  const subscription = await tenantScope(tenant.id).subscription.create({
    planId: plan.id,
    status,
    paymentProvider: 'payfast',
    trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
  });
  if (updatedAt) {
    await prisma.subscription.update({ where: { id: subscription.id }, data: { updatedAt } });
  }
  return tenant;
}

test('a trialing subscription is not blocked from POST', async () => {
  const tenant = await makeTenantWithSubscriptionStatus('trialing');
  const app = buildTestApp(tenant.id);
  const res = await request(app).post('/thing');
  assert.equal(res.status, 200);
});

test('an active subscription is not blocked from POST', async () => {
  const tenant = await makeTenantWithSubscriptionStatus('active');
  const app = buildTestApp(tenant.id);
  const res = await request(app).post('/thing');
  assert.equal(res.status, 200);
});

test('a lapsed subscription is blocked from POST with 402', async () => {
  const tenant = await makeTenantWithSubscriptionStatus('lapsed');
  const app = buildTestApp(tenant.id);
  const res = await request(app).post('/thing');
  assert.equal(res.status, 402);
});

test('a lapsed subscription is NOT blocked from GET', async () => {
  const tenant = await makeTenantWithSubscriptionStatus('lapsed');
  const app = buildTestApp(tenant.id);
  const res = await request(app).get('/thing');
  assert.equal(res.status, 200);
});

test('a past_due subscription still within the 7-day grace window is not blocked', async () => {
  const tenant = await makeTenantWithSubscriptionStatus('past_due', new Date(Date.now() - 3 * 24 * 60 * 60 * 1000));
  const app = buildTestApp(tenant.id);
  const res = await request(app).post('/thing');
  assert.equal(res.status, 200);
});

test('a past_due subscription past the 7-day grace window is blocked, treated as lapsed', async () => {
  const tenant = await makeTenantWithSubscriptionStatus('past_due', new Date(Date.now() - 8 * 24 * 60 * 60 * 1000));
  const app = buildTestApp(tenant.id);
  const res = await request(app).post('/thing');
  assert.equal(res.status, 402);
});

test('a tenant with no subscription at all is blocked from POST', async () => {
  const tenant = await prisma.tenant.create({
    data: { businessName: 'Acme Prints', contactName: 'Jane Doe', email: 'nosub@acmeprints.co.za', passwordHash: 'x' },
  });
  const app = buildTestApp(tenant.id);
  const res = await request(app).post('/thing');
  assert.equal(res.status, 402);
});
