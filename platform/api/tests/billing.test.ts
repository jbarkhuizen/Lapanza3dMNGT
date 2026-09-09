import { test, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildApp } from '../src/app.js';
import { resetTestDatabase } from './helpers/testApp.js';
import { prisma } from '../src/db/client.js';
import { payfastProvider } from '../src/billing/payfastProvider.js';

beforeEach(resetTestDatabase);

async function loggedInAgent(app: ReturnType<typeof buildApp>, email = 'jane@acmeprints.co.za') {
  await request(app).post('/api/auth/register').send({
    businessName: 'Acme Prints',
    contactName: 'Jane Doe',
    email,
    password: 'correct horse battery staple',
  });
  const tenant = await prisma.tenant.findUnique({ where: { email } });
  await request(app).post('/api/auth/verify-email').send({ token: tenant?.verificationToken });
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email, password: 'correct horse battery staple' });
  return agent;
}

test('GET /api/plans requires auth', async () => {
  const app = buildApp();
  const res = await request(app).get('/api/plans');
  assert.equal(res.status, 401);
});

test('GET /api/plans lists the 3 seeded plans, ordered by sortOrder', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const res = await agent.get('/api/plans');
  assert.equal(res.status, 200);
  assert.equal(res.body.plans.length, 3);
  assert.deepEqual(
    res.body.plans.map((p: { name: string }) => p.name),
    ['Tier 1', 'Tier 2', 'Tier 3'],
  );
});

test('GET /api/billing/subscription returns null when the tenant has no subscription yet', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const res = await agent.get('/api/billing/subscription');
  assert.equal(res.status, 200);
  assert.equal(res.body.subscription, null);
});

test('POST /api/billing/checkout rejects an unknown provider', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const plan = await prisma.plan.findFirstOrThrow({ where: { name: 'Tier 1' } });
  const res = await agent.post('/api/billing/checkout').send({ planId: plan.id, provider: 'not-a-real-provider' });
  assert.equal(res.status, 400);
});

test('POST /api/billing/checkout rejects an unknown planId', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const res = await agent.post('/api/billing/checkout').send({ planId: 'does-not-exist', provider: 'payfast' });
  assert.equal(res.status, 400);
});

test('POST /api/billing/checkout leaves NO subscription row behind if the provider call throws', async () => {
  const app = buildApp();
  const email = 'orphan@acmeprints.co.za';
  const agent = await loggedInAgent(app, email);
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { email } });
  const plan = await prisma.plan.findFirstOrThrow({ where: { name: 'Tier 1' } });

  mock.method(payfastProvider, 'createSubscriptionCheckout', async () => {
    throw new Error('provider is down');
  });

  try {
    const res = await agent.post('/api/billing/checkout').send({ planId: plan.id, provider: 'payfast' });
    assert.equal(res.status, 500);

    // This is the regression test for the orphan-row bug: since the
    // provider call now happens BEFORE any write, a throw here must leave
    // nothing behind — otherwise this tenant would be permanently blocked
    // from ever checking out again by the "already have a subscription"
    // guard.
    const subscription = await prisma.subscription.findUnique({ where: { tenantId: tenant.id } });
    assert.equal(subscription, null);
  } finally {
    mock.restoreAll();
  }
});

test('POST /api/billing/cancel calls provider.cancelSubscription with the persisted providerSubscriptionId, then marks canceled locally', async () => {
  const app = buildApp();
  const email = 'cancelme@acmeprints.co.za';
  const agent = await loggedInAgent(app, email);
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { email } });
  const plan = await prisma.plan.findFirstOrThrow({ where: { name: 'Tier 1' } });
  await prisma.subscription.create({
    data: {
      tenantId: tenant.id,
      planId: plan.id,
      status: 'active',
      paymentProvider: 'payfast',
      providerSubscriptionId: 'pf-sub-99',
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
  });

  const cancelCalls: string[] = [];
  mock.method(payfastProvider, 'cancelSubscription', async (providerSubscriptionId: string) => {
    cancelCalls.push(providerSubscriptionId);
  });

  try {
    const res = await agent.post('/api/billing/cancel').send({});
    assert.equal(res.status, 200);
    assert.deepEqual(cancelCalls, ['pf-sub-99']);

    const subscription = await prisma.subscription.findUnique({ where: { tenantId: tenant.id } });
    assert.equal(subscription?.status, 'canceled');
  } finally {
    mock.restoreAll();
  }
});

test('POST /api/billing/cancel cancels locally without calling the provider when no providerSubscriptionId was ever confirmed', async () => {
  const app = buildApp();
  const email = 'nevercharged@acmeprints.co.za';
  const agent = await loggedInAgent(app, email);
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { email } });
  const plan = await prisma.plan.findFirstOrThrow({ where: { name: 'Tier 1' } });
  await prisma.subscription.create({
    data: {
      tenantId: tenant.id,
      planId: plan.id,
      status: 'trialing',
      paymentProvider: 'payfast',
      // No providerSubscriptionId — no ITN has landed yet for this trial.
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
  });

  const cancelCalls: string[] = [];
  mock.method(payfastProvider, 'cancelSubscription', async (providerSubscriptionId: string) => {
    cancelCalls.push(providerSubscriptionId);
  });

  try {
    const res = await agent.post('/api/billing/cancel').send({});
    assert.equal(res.status, 200);
    assert.equal(cancelCalls.length, 0, 'the provider should never be called when there is no providerSubscriptionId');

    const subscription = await prisma.subscription.findUnique({ where: { tenantId: tenant.id } });
    assert.equal(subscription?.status, 'canceled');
  } finally {
    mock.restoreAll();
  }
});

test('full end-to-end resubscribe: checkout -> cancel -> checkout again, all through the real API endpoints', async () => {
  const app = buildApp();
  const email = 'e2e-resub@acmeprints.co.za';
  const agent = await loggedInAgent(app, email);
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { email } });
  const plan = await prisma.plan.findFirstOrThrow({ where: { name: 'Tier 1' } });

  mock.method(payfastProvider, 'createSubscriptionCheckout', async () => ({
    redirectUrl: 'https://sandbox.payfast.co.za/eng/process?first=1',
    // PayFast never returns a providerSubscriptionId synchronously, so
    // leave it unset here just like the real adapter does.
  }));
  const cancelCalls: string[] = [];
  mock.method(payfastProvider, 'cancelSubscription', async (providerSubscriptionId: string) => {
    cancelCalls.push(providerSubscriptionId);
  });

  try {
    // 1. First checkout — creates the trialing subscription.
    const firstCheckout = await agent.post('/api/billing/checkout').send({ planId: plan.id, provider: 'payfast' });
    assert.equal(firstCheckout.status, 200);
    const firstSubscription = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } });
    assert.equal(firstSubscription.status, 'trialing');

    // Simulate the ITN landing and activating the subscription, the same
    // way applyEvent() would on first webhook contact — this gives cancel
    // something with a providerSubscriptionId to actually call the
    // provider with.
    await prisma.subscription.update({
      where: { tenantId: tenant.id },
      data: { status: 'active', providerSubscriptionId: 'pf-sub-e2e-1' },
    });

    // 2. Cancel — must call the provider (since providerSubscriptionId is
    // now set) and flip local status.
    const cancelRes = await agent.post('/api/billing/cancel').send({});
    assert.equal(cancelRes.status, 200);
    assert.deepEqual(cancelCalls, ['pf-sub-e2e-1']);
    const canceledSubscription = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } });
    assert.equal(canceledSubscription.status, 'canceled');

    // 3. Checkout again — must succeed, replacing the dead canceled row,
    // not be blocked by the "already have a subscription" guard.
    const secondCheckout = await agent.post('/api/billing/checkout').send({ planId: plan.id, provider: 'payfast' });
    assert.equal(secondCheckout.status, 200);
    const secondSubscription = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } });
    assert.equal(secondSubscription.status, 'trialing');
    assert.notEqual(secondSubscription.id, canceledSubscription.id);
    assert.equal(secondSubscription.providerSubscriptionId, null, 'the new row should not inherit the old provider id');
  } finally {
    mock.restoreAll();
  }
});

test('a canceled tenant CAN call checkout again and succeed (the old row does not block a resubscribe)', async () => {
  const app = buildApp();
  const email = 'resub@acmeprints.co.za';
  const agent = await loggedInAgent(app, email);
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { email } });
  const plan = await prisma.plan.findFirstOrThrow({ where: { name: 'Tier 1' } });
  const oldSubscription = await prisma.subscription.create({
    data: {
      tenantId: tenant.id,
      planId: plan.id,
      status: 'canceled',
      paymentProvider: 'payfast',
      providerSubscriptionId: 'pf-sub-old',
      trialEndsAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    },
  });

  mock.method(payfastProvider, 'createSubscriptionCheckout', async () => ({
    redirectUrl: 'https://sandbox.payfast.co.za/eng/process?resub=1',
  }));

  try {
    const res = await agent.post('/api/billing/checkout').send({ planId: plan.id, provider: 'payfast' });
    assert.equal(res.status, 200);
    assert.ok(res.body.redirectUrl);

    const subscription = await prisma.subscription.findUnique({ where: { tenantId: tenant.id } });
    assert.equal(subscription?.status, 'trialing');
    assert.notEqual(subscription?.id, oldSubscription.id, 'the old canceled row should have been replaced, not updated');
  } finally {
    mock.restoreAll();
  }
});
