import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/db/client.js';
import { resetTestDatabase } from './helpers/testApp.js';

const app = buildApp();

beforeEach(resetTestDatabase);

// resetTestDatabase() deletes and recreates the Plan table (seeding
// Tier 1/Tier 2/Tier 3 fresh) before every test in this suite, so nothing
// leaks between tests regardless of execution order. Tests below still
// reuse the already-seeded Tier 1 plan for a Subscription's required
// planId rather than creating a new one, and the one test that genuinely
// needs a throwaway plan cleans it up itself via try/finally — defensive
// practice kept even though the per-test reset would also catch it.

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

  const plan = await prisma.plan.findFirstOrThrow({ where: { name: 'Tier 1' } });

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
  const plan = await prisma.plan.findFirstOrThrow({ where: { name: 'Tier 1' } });
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
  const retired = await prisma.plan.create({
    data: { name: 'Retired', monthlyPrice: '10.00', sortOrder: 0, active: false },
  });

  try {
    const res = await request(app).get('/api/public/plans');

    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);

    type PublicPlan = { name: string; monthlyPrice: string; sortOrder: number };
    const plans = res.body.plans as PublicPlan[];

    assert.ok(!plans.some((p) => p.name === 'Retired'), 'inactive plans must be excluded');

    const tier1 = plans.find((p) => p.name === 'Tier 1');
    const tier2 = plans.find((p) => p.name === 'Tier 2');
    const tier3 = plans.find((p) => p.name === 'Tier 3');
    assert.ok(tier1 && tier2 && tier3, 'all 3 seeded plans should be present');
    assert.equal(tier1!.monthlyPrice, '25.00');
    assert.equal(tier2!.monthlyPrice, '45.00');
    assert.equal(tier3!.monthlyPrice, '70.00');

    const tier1Index = plans.findIndex((p) => p.name === 'Tier 1');
    const tier2Index = plans.findIndex((p) => p.name === 'Tier 2');
    const tier3Index = plans.findIndex((p) => p.name === 'Tier 3');
    assert.ok(tier1Index < tier2Index && tier2Index < tier3Index, 'plans must be sorted by sortOrder');
  } finally {
    // resetTestDatabase() would also clean this up before the next test
    // (see the note at the top of this file), but delete it explicitly
    // anyway so this test doesn't rely on run order to stay tidy.
    await prisma.plan.delete({ where: { id: retired.id } });
  }
});

test('public routes are reachable with no session cookie at all (no 401)', async () => {
  const statsRes = await request(app).get('/api/public/stats');
  const plansRes = await request(app).get('/api/public/plans');
  assert.notEqual(statsRes.status, 401);
  assert.notEqual(plansRes.status, 401);
});

test('GET /api/public/stats is rate-limited after repeated requests', async () => {
  // Fresh app so this test's own limiter bucket doesn't bleed into the
  // shared module-level `app` the other tests in this file reuse.
  const freshApp = buildApp();
  let lastStatus = 0;
  for (let i = 0; i < 61; i++) {
    const res = await request(freshApp).get('/api/public/stats');
    lastStatus = res.status;
  }
  assert.equal(lastStatus, 429);
});
