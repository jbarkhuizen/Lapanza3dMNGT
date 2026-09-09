import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/db/client.js';
import { resetTestDatabase } from './helpers/testApp.js';

const app = buildApp();

beforeEach(resetTestDatabase);

test('GET /api/public/stats returns real counts with no auth', async () => {
  const tenant1 = await prisma.tenant.create({
    data: {
      businessName: 'Shop One',
      contactName: 'Owner One',
      email: 'shop-one@example.com',
      passwordHash: 'x',
      emailVerifiedAt: new Date(),
    },
  });
  await prisma.tenant.create({
    data: {
      businessName: 'Shop Two',
      contactName: 'Owner Two',
      email: 'shop-two@example.com',
      passwordHash: 'x',
      emailVerifiedAt: new Date(),
    },
  });

  const plan = await prisma.plan.create({
    data: { name: 'Basic', monthlyPrice: '25.00', sortOrder: 1 },
  });

  await prisma.subscription.create({
    data: {
      tenantId: tenant1.id,
      planId: plan.id,
      status: 'trialing',
      paymentProvider: 'payfast',
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
  });

  const res = await request(app).get('/api/public/stats');

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.registeredBusinesses, 2);
  // trialing counts as an active subscription; the second tenant has none
  assert.equal(res.body.activeSubscriptions, 1);
});

test('GET /api/public/stats does not count lapsed/canceled subscriptions as active', async () => {
  const tenant = await prisma.tenant.create({
    data: {
      businessName: 'Shop',
      contactName: 'Owner',
      email: 'shop@example.com',
      passwordHash: 'x',
      emailVerifiedAt: new Date(),
    },
  });
  const plan = await prisma.plan.create({
    data: { name: 'Basic', monthlyPrice: '25.00', sortOrder: 1 },
  });
  await prisma.subscription.create({
    data: {
      tenantId: tenant.id,
      planId: plan.id,
      status: 'lapsed',
      paymentProvider: 'payfast',
      trialEndsAt: new Date(),
    },
  });

  const res = await request(app).get('/api/public/stats');

  assert.equal(res.body.registeredBusinesses, 1);
  assert.equal(res.body.activeSubscriptions, 0);
});

test('GET /api/public/plans returns active plans sorted, with no auth', async () => {
  await prisma.plan.create({ data: { name: 'Tier 2', monthlyPrice: '45.00', sortOrder: 2 } });
  await prisma.plan.create({ data: { name: 'Basic', monthlyPrice: '25.00', sortOrder: 1 } });
  await prisma.plan.create({ data: { name: 'Retired', monthlyPrice: '10.00', sortOrder: 3, active: false } });

  const res = await request(app).get('/api/public/plans');

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.plans.length, 2);
  assert.equal(res.body.plans[0].name, 'Tier 1');
  assert.equal(res.body.plans[0].monthlyPrice, '25.00');
  assert.equal(res.body.plans[1].name, 'Tier 2');
});

test('public routes are reachable with no session cookie at all (no 401)', async () => {
  const statsRes = await request(app).get('/api/public/stats');
  const plansRes = await request(app).get('/api/public/plans');
  assert.notEqual(statsRes.status, 401);
  assert.notEqual(plansRes.status, 401);
});
