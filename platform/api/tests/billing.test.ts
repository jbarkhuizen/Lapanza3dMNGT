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

  // Capture the subscriptionId billing.ts generates and passes into the
  // provider call on each checkout — this is the id that's supposed to end
  // up as the created row's own primary key (asserted below), proving the
  // round trip: the id embedded in PayFast's m_payment_id is the exact id
  // the row gets, not something derived from tenantId.
  const checkoutCalls: Array<{ subscriptionId: string }> = [];
  mock.method(payfastProvider, 'createSubscriptionCheckout', async (params: { subscriptionId: string }) => {
    checkoutCalls.push({ subscriptionId: params.subscriptionId });
    return {
      redirectUrl: 'https://sandbox.payfast.co.za/eng/process?first=1',
      // PayFast never returns a providerSubscriptionId synchronously, so
      // leave it unset here just like the real adapter does.
    };
  });
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
    assert.equal(checkoutCalls.length, 1);
    assert.ok(checkoutCalls[0].subscriptionId, 'a subscriptionId must be generated and sent to the provider');
    assert.equal(
      firstSubscription.id,
      checkoutCalls[0].subscriptionId,
      'the row created must have the exact id that was sent to the provider as m_payment_id',
    );

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

    assert.equal(checkoutCalls.length, 2);
    assert.equal(
      secondSubscription.id,
      checkoutCalls[1].subscriptionId,
      'the resubscribed row must have the exact (fresh) id that was sent to the provider on this second checkout',
    );
    assert.notEqual(
      checkoutCalls[1].subscriptionId,
      checkoutCalls[0].subscriptionId,
      'each checkout must generate a brand-new subscriptionId — this is what makes a stale ITN for the old row unresolvable after resubscribe',
    );
  } finally {
    mock.restoreAll();
  }
});

test('resubscribing after lapsed with a providerSubscriptionId set calls provider.cancelSubscription before creating the new row', async () => {
  const app = buildApp();
  const email = 'lapsed-resub@acmeprints.co.za';
  const agent = await loggedInAgent(app, email);
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { email } });
  const plan = await prisma.plan.findFirstOrThrow({ where: { name: 'Tier 1' } });
  // A 'lapsed' row is self-healed LOCALLY by requireActiveSubscription,
  // which never calls the provider — so it can still carry a live
  // providerSubscriptionId the provider doesn't know is dead yet.
  const oldSubscription = await prisma.subscription.create({
    data: {
      tenantId: tenant.id,
      planId: plan.id,
      status: 'lapsed',
      paymentProvider: 'payfast',
      providerSubscriptionId: 'pf-sub-lapsed',
      trialEndsAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    },
  });

  const cancelCalls: string[] = [];
  mock.method(payfastProvider, 'cancelSubscription', async (providerSubscriptionId: string) => {
    cancelCalls.push(providerSubscriptionId);
  });
  mock.method(payfastProvider, 'createSubscriptionCheckout', async () => ({
    redirectUrl: 'https://sandbox.payfast.co.za/eng/process?resub=1',
  }));

  try {
    const res = await agent.post('/api/billing/checkout').send({ planId: plan.id, provider: 'payfast' });
    assert.equal(res.status, 200);
    assert.deepEqual(
      cancelCalls,
      ['pf-sub-lapsed'],
      'the old live provider subscription must be canceled before the row is deleted, or the tenant ends up paying for two',
    );

    const subscription = await prisma.subscription.findUnique({ where: { tenantId: tenant.id } });
    assert.equal(subscription?.status, 'trialing');
    assert.notEqual(subscription?.id, oldSubscription.id, 'the old lapsed row should have been replaced, not updated');
  } finally {
    mock.restoreAll();
  }
});

test('resubscribing after lapsed still succeeds even if provider.cancelSubscription rejects (best-effort, must not block resubscribe)', async () => {
  const app = buildApp();
  const email = 'lapsed-resub-failcancel@acmeprints.co.za';
  const agent = await loggedInAgent(app, email);
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { email } });
  const plan = await prisma.plan.findFirstOrThrow({ where: { name: 'Tier 1' } });
  await prisma.subscription.create({
    data: {
      tenantId: tenant.id,
      planId: plan.id,
      status: 'lapsed',
      paymentProvider: 'payfast',
      providerSubscriptionId: 'pf-sub-already-dead',
      trialEndsAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    },
  });

  mock.method(payfastProvider, 'cancelSubscription', async () => {
    throw new Error('404 — already canceled provider-side');
  });
  mock.method(payfastProvider, 'createSubscriptionCheckout', async () => ({
    redirectUrl: 'https://sandbox.payfast.co.za/eng/process?resub=1',
  }));

  try {
    const res = await agent.post('/api/billing/checkout').send({ planId: plan.id, provider: 'payfast' });
    assert.equal(res.status, 200, 'a provider cancel failure during resubscribe must not block the new checkout');

    const subscription = await prisma.subscription.findUnique({ where: { tenantId: tenant.id } });
    assert.equal(subscription?.status, 'trialing');
  } finally {
    mock.restoreAll();
  }
});

test('POST /api/billing/cancel is fail-closed: if provider.cancelSubscription rejects, the response is a 5xx and local status stays unchanged', async () => {
  const app = buildApp();
  const email = 'cancel-provider-fails@acmeprints.co.za';
  const agent = await loggedInAgent(app, email);
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { email } });
  const plan = await prisma.plan.findFirstOrThrow({ where: { name: 'Tier 1' } });
  await prisma.subscription.create({
    data: {
      tenantId: tenant.id,
      planId: plan.id,
      status: 'active',
      paymentProvider: 'payfast',
      providerSubscriptionId: 'pf-sub-fail-cancel',
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
  });

  mock.method(payfastProvider, 'cancelSubscription', async () => {
    throw new Error('provider is down');
  });

  try {
    const res = await agent.post('/api/billing/cancel').send({});
    assert.ok(res.status >= 500 && res.status < 600, `expected a 5xx response, got ${res.status}`);

    const subscription = await prisma.subscription.findUnique({ where: { tenantId: tenant.id } });
    assert.notEqual(
      subscription?.status,
      'canceled',
      'local status must not flip to canceled when the provider call failed — that would silently strand a still-live provider subscription',
    );
    assert.equal(subscription?.status, 'active');
  } finally {
    mock.restoreAll();
  }
});

test('a past_due tenant CAN call checkout again and succeed, attempting to cancel the old provider subscription first', async () => {
  const app = buildApp();
  const email = 'past-due-resub@acmeprints.co.za';
  const agent = await loggedInAgent(app, email);
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { email } });
  const plan = await prisma.plan.findFirstOrThrow({ where: { name: 'Tier 1' } });
  // A past_due subscription normally DOES have a real providerSubscriptionId
  // bound — that's how it got to past_due in the first place: a genuine
  // payment_failed webhook, which only ever fires after first contact.
  const oldSubscription = await prisma.subscription.create({
    data: {
      tenantId: tenant.id,
      planId: plan.id,
      status: 'past_due',
      paymentProvider: 'payfast',
      providerSubscriptionId: 'pf-sub-past-due',
      pastDueSince: new Date(),
      trialEndsAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    },
  });

  const cancelCalls: string[] = [];
  mock.method(payfastProvider, 'cancelSubscription', async (providerSubscriptionId: string) => {
    cancelCalls.push(providerSubscriptionId);
  });
  mock.method(payfastProvider, 'createSubscriptionCheckout', async () => ({
    redirectUrl: 'https://sandbox.payfast.co.za/eng/process?resub=1',
  }));

  try {
    const res = await agent.post('/api/billing/checkout').send({ planId: plan.id, provider: 'payfast' });
    assert.equal(res.status, 200);
    assert.deepEqual(
      cancelCalls,
      ['pf-sub-past-due'],
      'the failing provider subscription must be canceled before the row is deleted and replaced, or the tenant ends up paying for two',
    );

    const subscription = await prisma.subscription.findUnique({ where: { tenantId: tenant.id } });
    assert.equal(subscription?.status, 'trialing');
    assert.notEqual(subscription?.id, oldSubscription.id, 'the old past_due row should have been replaced, not updated');
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
  // The old row still has a providerSubscriptionId, so Fix 2's best-effort
  // cancel-before-delete now calls out to the provider here too — mock it
  // so this test doesn't make a live network call to PayFast's API.
  mock.method(payfastProvider, 'cancelSubscription', async () => {});

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
