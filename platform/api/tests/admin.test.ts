import { test, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/db/client.js';
import { hashPassword } from '../src/auth/password.js';
import { resetTestDatabase } from './helpers/testApp.js';
import { payfastProvider } from '../src/billing/payfastProvider.js';

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

test('cancel on a subscription with a real providerSubscriptionId calls the real provider before marking canceled locally', async () => {
  // Every other cancel test in this file goes through an admin-granted
  // subscription, which always has paymentProvider: 'manual' and
  // providerSubscriptionId: null — so the fail-closed real-provider branch
  // of POST /tenants/:id/subscription/cancel (the one that calls
  // provider.cancelSubscription before updating status) has never actually
  // been exercised. Create a row directly via Prisma with a real provider
  // and a non-null providerSubscriptionId to exercise it, mocking
  // payfastProvider.cancelSubscription the same way billing.test.ts mocks
  // the equivalent tenant-facing cancel route (POST /api/billing/cancel).
  const { tenant, plan } = await makeTenantAndPlan();
  await prisma.subscription.create({
    data: {
      tenantId: tenant.id,
      planId: plan.id,
      status: 'active',
      paymentProvider: 'payfast',
      providerSubscriptionId: 'sub_test_123',
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
  });

  const cancelCalls: string[] = [];
  let statusAtCallTime: string | undefined;
  mock.method(payfastProvider, 'cancelSubscription', async (providerSubscriptionId: string) => {
    cancelCalls.push(providerSubscriptionId);
    const current = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } });
    statusAtCallTime = current.status;
  });

  try {
    const agent = await loggedInAdminAgent();
    const res = await agent.post(`/api/admin/tenants/${tenant.id}/subscription/cancel`);
    assert.equal(res.status, 302);
    assert.deepEqual(cancelCalls, ['sub_test_123']);
    assert.equal(statusAtCallTime, 'active', 'the provider must be called BEFORE the local status flips to canceled');

    const cancelled = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } });
    assert.equal(cancelled.status, 'canceled');
  } finally {
    mock.restoreAll();
  }
});

test('grant on an existing subscription calls the real provider to cancel it BEFORE the local row is replaced', async () => {
  // Direct coverage for the provider-cancel-before-delete ordering (the
  // first of the review round's Important fixes) — mocking
  // payfastProvider.cancelSubscription the same way the cancel-route test
  // above does, and the tenant-facing billing.test.ts does for the
  // equivalent resubscribe-over-an-existing-row path.
  const { tenant } = await makeTenantAndPlan();
  const tier1 = await prisma.plan.findFirstOrThrow({ where: { name: 'Tier 1' } });
  const tier2 = await prisma.plan.findFirstOrThrow({ where: { name: 'Tier 2' } });
  const original = await prisma.subscription.create({
    data: {
      tenantId: tenant.id,
      planId: tier1.id,
      status: 'active',
      paymentProvider: 'payfast',
      providerSubscriptionId: 'sub_test_456',
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
  });

  const cancelCalls: string[] = [];
  let rowIdAtCallTime: string | undefined;
  mock.method(payfastProvider, 'cancelSubscription', async (providerSubscriptionId: string) => {
    cancelCalls.push(providerSubscriptionId);
    const current = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } });
    rowIdAtCallTime = current.id;
  });

  try {
    const agent = await loggedInAdminAgent();
    const res = await agent.post(`/api/admin/tenants/${tenant.id}/subscription/grant`).send({ planId: tier2.id });
    assert.equal(res.status, 302);
    assert.deepEqual(cancelCalls, ['sub_test_456']);
    assert.equal(rowIdAtCallTime, original.id, 'the provider must be called BEFORE the old row is deleted and replaced');

    const replaced = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } });
    assert.notEqual(replaced.id, original.id);
    assert.equal(replaced.planId, tier2.id);
    assert.equal(replaced.paymentProvider, 'manual');
    assert.equal(replaced.providerSubscriptionId, null);
  } finally {
    mock.restoreAll();
  }
});

test('grant on a subscription with an unrecognized paymentProvider fails loudly instead of throwing past the best-effort catch', async () => {
  // Direct coverage for the !provider guard mirrored from the cancel
  // route (this task's finding 1). Without it, `providers[existing.
  // paymentProvider]` returns undefined and calling .cancelSubscription()
  // on it throws a TypeError before the .catch() below ever attaches,
  // turning this "never blocks the grant" best-effort path into an
  // unhandled 500 with no clear message.
  const { tenant } = await makeTenantAndPlan();
  const tier1 = await prisma.plan.findFirstOrThrow({ where: { name: 'Tier 1' } });
  const tier2 = await prisma.plan.findFirstOrThrow({ where: { name: 'Tier 2' } });
  await prisma.subscription.create({
    data: {
      tenantId: tenant.id,
      planId: tier1.id,
      status: 'active',
      paymentProvider: 'some-legacy-provider-no-longer-registered',
      providerSubscriptionId: 'sub_test_789',
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
  });

  const agent = await loggedInAdminAgent();
  const res = await agent.post(`/api/admin/tenants/${tenant.id}/subscription/grant`).send({ planId: tier2.id });
  assert.equal(res.status, 500);
  assert.match(res.text, /Unrecognized payment provider/);

  const unchanged = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } });
  assert.equal(unchanged.paymentProvider, 'some-legacy-provider-no-longer-registered');
  assert.equal(unchanged.planId, tier1.id, 'the existing row must be untouched when the guard fires');
});

test('grant with a planId that is not a real active plan is rejected before contacting the provider or touching the existing subscription', async () => {
  // Direct coverage for finding 2: planId must be validated against the
  // active-plans set before the irreversible provider-cancel call runs,
  // not after. Covers both a planId that doesn't exist at all and one
  // that exists but has been deactivated.
  const { tenant } = await makeTenantAndPlan();
  const tier1 = await prisma.plan.findFirstOrThrow({ where: { name: 'Tier 1' } });
  const inactivePlan = await prisma.plan.create({
    data: { name: 'Retired Tier', monthlyPrice: '99.00', sortOrder: 99, active: false },
  });
  const original = await prisma.subscription.create({
    data: {
      tenantId: tenant.id,
      planId: tier1.id,
      status: 'active',
      paymentProvider: 'payfast',
      providerSubscriptionId: 'sub_test_planid',
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
  });

  const cancelCalls: string[] = [];
  mock.method(payfastProvider, 'cancelSubscription', async (providerSubscriptionId: string) => {
    cancelCalls.push(providerSubscriptionId);
  });

  try {
    const agent = await loggedInAdminAgent();

    const resMissing = await agent
      .post(`/api/admin/tenants/${tenant.id}/subscription/grant`)
      .send({ planId: 'not-a-real-plan-id' });
    assert.equal(resMissing.status, 302);

    const resInactive = await agent
      .post(`/api/admin/tenants/${tenant.id}/subscription/grant`)
      .send({ planId: inactivePlan.id });
    assert.equal(resInactive.status, 302);

    assert.deepEqual(cancelCalls, [], 'the provider must never be contacted for a bad planId');

    const untouched = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } });
    assert.equal(untouched.id, original.id, 'the existing subscription row must not be deleted or replaced');
    assert.equal(untouched.planId, tier1.id);
    assert.equal(untouched.providerSubscriptionId, 'sub_test_planid');
  } finally {
    mock.restoreAll();
  }
});

test('the transactional delete+create leaves the tenant with a subscription row, not zero, when the create fails mid-transaction', async () => {
  // Direct coverage for finding 4's transactional delete+create fix. Fix
  // 2 above means a bad planId can no longer reach this transaction via
  // the route itself (it's rejected earlier), so this exercises the same
  // delete-then-create pair admin.ts wraps in prisma.$transaction directly
  // with a planId that doesn't exist, to prove the FK violation on create
  // rolls the whole transaction back rather than leaving the delete
  // committed and the tenant with zero subscription rows.
  const { tenant } = await makeTenantAndPlan();
  const tier1 = await prisma.plan.findFirstOrThrow({ where: { name: 'Tier 1' } });
  const original = await prisma.subscription.create({
    data: {
      tenantId: tenant.id,
      planId: tier1.id,
      status: 'active',
      paymentProvider: 'manual',
      providerSubscriptionId: null,
      trialEndsAt: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  const { Prisma } = await import('@prisma/client');
  await assert.rejects(
    () =>
      prisma.$transaction([
        prisma.subscription.deleteMany({ where: { tenantId: tenant.id } }),
        prisma.subscription.create({
          data: {
            tenantId: tenant.id,
            planId: 'does-not-exist-as-a-plan-id',
            status: 'active',
            paymentProvider: 'manual',
            providerSubscriptionId: null,
            trialEndsAt: new Date(),
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        }),
      ]),
    (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003',
  );

  const survivors = await prisma.subscription.findMany({ where: { tenantId: tenant.id } });
  assert.equal(survivors.length, 1, 'the transaction must roll back atomically, leaving the original row intact');
  assert.equal(survivors[0]?.id, original.id);
});

test('adjust to status=active with no explicit date extends a genuinely stale currentPeriodEnd forward', async () => {
  const { tenant, plan } = await makeTenantAndPlan();
  const agent = await loggedInAdminAgent();
  await agent.post(`/api/admin/tenants/${tenant.id}/subscription/grant`).send({ planId: plan.id });

  // Simulate a row that's gone stale (e.g. weeks-old from a past_due ->
  // lapsed history) the way requireActiveSubscription.ts's self-heal
  // would treat it: currentPeriodEnd already in the past.
  await prisma.subscription.update({
    where: { tenantId: tenant.id },
    data: { currentPeriodEnd: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) },
  });

  const res = await agent.post(`/api/admin/tenants/${tenant.id}/subscription/adjust`).send({ status: 'active' });
  assert.equal(res.status, 302);

  const updated = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } });
  assert.ok(updated.currentPeriodEnd);
  assert.ok(updated.currentPeriodEnd!.getTime() > Date.now(), 'a stale currentPeriodEnd must be pushed into the future');
});

test('adjust to status=active with no explicit date leaves an already-current currentPeriodEnd untouched', async () => {
  const { tenant, plan } = await makeTenantAndPlan();
  const agent = await loggedInAdminAgent();
  await agent.post(`/api/admin/tenants/${tenant.id}/subscription/grant`).send({ planId: plan.id });

  const granted = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } });
  assert.ok(granted.currentPeriodEnd);
  assert.ok(granted.currentPeriodEnd!.getTime() > Date.now(), 'sanity check: the freshly granted row is not stale');

  // Re-saving status=active with no explicit date on an already-current,
  // already-active subscription must not push its currentPeriodEnd out —
  // it was never stale in the first place.
  const res = await agent.post(`/api/admin/tenants/${tenant.id}/subscription/adjust`).send({ status: 'active' });
  assert.equal(res.status, 302);

  const after = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } });
  assert.deepEqual(after.currentPeriodEnd, granted.currentPeriodEnd);
});

test('adjust manages pastDueSince like the webhook flow: stamps on first past_due, does not re-stamp on a second, clears on recovery', async () => {
  const { tenant, plan } = await makeTenantAndPlan();
  const agent = await loggedInAdminAgent();
  await agent.post(`/api/admin/tenants/${tenant.id}/subscription/grant`).send({ planId: plan.id });

  const granted = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } });
  assert.equal(granted.status, 'active');
  assert.equal(granted.pastDueSince, null);

  await agent.post(`/api/admin/tenants/${tenant.id}/subscription/adjust`).send({ status: 'past_due' });
  const firstPastDue = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } });
  assert.equal(firstPastDue.status, 'past_due');
  assert.ok(firstPastDue.pastDueSince);
  const firstStampedAt = firstPastDue.pastDueSince;

  await agent.post(`/api/admin/tenants/${tenant.id}/subscription/adjust`).send({ status: 'past_due' });
  const secondPastDue = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } });
  assert.equal(secondPastDue.status, 'past_due');
  assert.deepEqual(secondPastDue.pastDueSince, firstStampedAt);

  await agent.post(`/api/admin/tenants/${tenant.id}/subscription/adjust`).send({ status: 'active' });
  const recovered = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } });
  assert.equal(recovered.status, 'active');
  assert.equal(recovered.pastDueSince, null);
});

async function makeTenantWithCustomerAndQuote() {
  const passwordHash = await hashPassword('irrelevant password value');
  const tenant = await prisma.tenant.create({
    data: { businessName: 'Acme Prints', contactName: 'Jane', email: 'jane@acmeprints.co.za', passwordHash },
  });
  const customer = await prisma.customer.create({
    data: { tenantId: tenant.id, name: 'Bob Buyer', billingAddress: '1 Main St' },
  });
  const quote = await prisma.quote.create({
    data: {
      tenantId: tenant.id, number: 'QT-0001', customerId: customer.id,
      vatApplied: false, subtotal: '100.00', vatAmount: '0.00', total: '100.00',
    },
  });
  return { tenant, customer, quote };
}

test('GET /api/admin/tenants/:id/quotes lists that tenant\'s quotes only', async () => {
  const { tenant, quote } = await makeTenantWithCustomerAndQuote();
  const passwordHash = await hashPassword('irrelevant password value');
  const otherTenant = await prisma.tenant.create({
    data: { businessName: 'Other Co', contactName: 'Bob', email: 'bob@other.co.za', passwordHash },
  });
  const otherCustomer = await prisma.customer.create({
    data: { tenantId: otherTenant.id, name: 'Someone Else', billingAddress: '2 Other St' },
  });
  await prisma.quote.create({
    data: {
      tenantId: otherTenant.id, number: 'QT-0001', customerId: otherCustomer.id,
      vatApplied: false, subtotal: '999.00', vatAmount: '0.00', total: '999.00',
    },
  });

  const agent = await loggedInAdminAgent();
  const res = await agent.get(`/api/admin/tenants/${tenant.id}/quotes`);
  assert.equal(res.status, 200);
  assert.match(res.text, /QT-0001/);
  assert.match(res.text, /Bob Buyer/);
  assert.ok(!res.text.includes('999.00'), 'must not show the other tenant\'s quote');
});

test('GET /api/admin/tenants/:id/invoices lists that tenant\'s invoices only', async () => {
  const { tenant, customer } = await makeTenantWithCustomerAndQuote();
  await prisma.invoice.create({
    data: {
      tenantId: tenant.id, number: 'INV-0001', customerId: customer.id, dueDate: new Date(),
      vatApplied: false, subtotal: '100.00', vatAmount: '0.00', total: '100.00', amountPaid: '0.00',
    },
  });

  const passwordHash = await hashPassword('irrelevant password value');
  const otherTenant = await prisma.tenant.create({
    data: { businessName: 'Other Co', contactName: 'Bob', email: 'bob@other.co.za', passwordHash },
  });
  const otherCustomer = await prisma.customer.create({
    data: { tenantId: otherTenant.id, name: 'Someone Else', billingAddress: '2 Other St' },
  });
  await prisma.invoice.create({
    data: {
      tenantId: otherTenant.id, number: 'INV-0001', customerId: otherCustomer.id, dueDate: new Date(),
      vatApplied: false, subtotal: '888.00', vatAmount: '0.00', total: '888.00', amountPaid: '0.00',
    },
  });

  const agent = await loggedInAdminAgent();
  const res = await agent.get(`/api/admin/tenants/${tenant.id}/invoices`);
  assert.equal(res.status, 200);
  assert.match(res.text, /INV-0001/);
  assert.match(res.text, /Bob Buyer/);
  assert.ok(!res.text.includes('888.00'), 'must not show the other tenant\'s invoice');
});

test('adjust clears pastDueSince on recovery to active even when the row went through lapsed (self-heal) first, not directly from past_due', async () => {
  const { tenant, plan } = await makeTenantAndPlan();
  const agent = await loggedInAdminAgent();
  await agent.post(`/api/admin/tenants/${tenant.id}/subscription/grant`).send({ planId: plan.id });

  await agent.post(`/api/admin/tenants/${tenant.id}/subscription/adjust`).send({ status: 'past_due' });
  const pastDue = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } });
  assert.equal(pastDue.status, 'past_due');
  assert.ok(pastDue.pastDueSince);
  const stampedAt = pastDue.pastDueSince;

  // Simulate requireActiveSubscription's self-heal, which flips
  // past_due -> lapsed without touching pastDueSince (scoped.ts's
  // updateStatus only sets status).
  await agent.post(`/api/admin/tenants/${tenant.id}/subscription/adjust`).send({ status: 'lapsed' });
  const lapsed = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } });
  assert.equal(lapsed.status, 'lapsed');
  assert.deepEqual(lapsed.pastDueSince, stampedAt);

  await agent.post(`/api/admin/tenants/${tenant.id}/subscription/adjust`).send({ status: 'active' });
  const recovered = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } });
  assert.equal(recovered.status, 'active');
  assert.equal(recovered.pastDueSince, null);
});

test('GET /api/admin/plans lists the seeded plans', async () => {
  const agent = await loggedInAdminAgent();
  const res = await agent.get('/api/admin/plans');
  assert.equal(res.status, 200);
  assert.match(res.text, /Tier 1/);
  assert.match(res.text, /25\.00/);
});

test('POST /api/admin/plans creates a new plan', async () => {
  const agent = await loggedInAdminAgent();
  const res = await agent.post('/api/admin/plans').send({ name: 'Tier 4', monthlyPrice: '95.00', sortOrder: '4' });
  assert.equal(res.status, 302);

  const plan = await prisma.plan.findFirstOrThrow({ where: { name: 'Tier 4' } });
  assert.equal(plan.monthlyPrice.toFixed(2), '95.00');
  assert.equal(plan.sortOrder, 4);
  assert.equal(plan.active, true);
});

test('POST /api/admin/plans/:id/edit updates price, name, sortOrder, and active', async () => {
  const plan = await prisma.plan.findFirstOrThrow({ where: { name: 'Tier 1' } });
  const agent = await loggedInAdminAgent();
  const res = await agent.post(`/api/admin/plans/${plan.id}/edit`).send({
    name: 'Tier 1 (renamed)', monthlyPrice: '30.00', sortOrder: '1',
    // no 'active' key at all — matches an unchecked HTML checkbox, which
    // submits nothing for that field
  });
  assert.equal(res.status, 302);

  const updated = await prisma.plan.findUniqueOrThrow({ where: { id: plan.id } });
  assert.equal(updated.name, 'Tier 1 (renamed)');
  assert.equal(updated.monthlyPrice.toFixed(2), '30.00');
  assert.equal(updated.active, false, 'an unchecked checkbox must deactivate the plan');
});

test('POST /api/admin/plans/:id/edit with active="on" keeps the plan active', async () => {
  const plan = await prisma.plan.findFirstOrThrow({ where: { name: 'Tier 2' } });
  const agent = await loggedInAdminAgent();
  await agent.post(`/api/admin/plans/${plan.id}/edit`).send({
    name: 'Tier 2', monthlyPrice: '45.00', sortOrder: '2', active: 'on',
  });

  const updated = await prisma.plan.findUniqueOrThrow({ where: { id: plan.id } });
  assert.equal(updated.active, true);
});

test('GET /api/admin/backlog defaults to open items only, sorted by priority', async () => {
  await prisma.backlogItem.createMany({
    data: [
      { number: 1, title: 'Low priority open item', description: 'desc one', category: 'Bug', priority: 'Low', status: 'Backlog', dateAdded: new Date() },
      { number: 2, title: 'Critical open item', description: 'desc two', category: 'Bug', priority: 'Critical', status: 'Backlog', dateAdded: new Date() },
      { number: 3, title: 'Done item, should not show by default', description: 'desc three', category: 'Bug', priority: 'Critical', status: 'Done', dateAdded: new Date(), actualFixDate: new Date() },
    ],
  });
  const agent = await loggedInAdminAgent();
  const res = await agent.get('/api/admin/backlog');
  assert.equal(res.status, 200);
  assert.match(res.text, /Critical open item/);
  assert.match(res.text, /Low priority open item/);
  assert.ok(!res.text.includes('Done item, should not show by default'));

  const criticalIndex = res.text.indexOf('Critical open item');
  const lowIndex = res.text.indexOf('Low priority open item');
  assert.ok(criticalIndex < lowIndex, 'Critical priority item should render before Low priority item');
});

test('GET /api/admin/backlog?status=Done shows only done items', async () => {
  await prisma.backlogItem.createMany({
    data: [
      { number: 1, title: 'Open item', description: 'desc', category: 'Bug', priority: 'Medium', status: 'Backlog', dateAdded: new Date() },
      { number: 2, title: 'Finished item', description: 'desc', category: 'Bug', priority: 'Medium', status: 'Done', dateAdded: new Date(), actualFixDate: new Date() },
    ],
  });
  const agent = await loggedInAdminAgent();
  const res = await agent.get('/api/admin/backlog?status=Done');
  assert.equal(res.status, 200);
  assert.match(res.text, /Finished item/);
  assert.ok(!res.text.includes('Open item'));
});

test('POST /api/admin/backlog creates a new item with the next sequential number and Backlog status', async () => {
  await prisma.backlogItem.create({
    data: { number: 5, title: 'Existing', description: 'desc', category: 'Bug', priority: 'Low', status: 'Backlog', dateAdded: new Date() },
  });
  const agent = await loggedInAdminAgent();
  const res = await agent.post('/api/admin/backlog').send({
    title: 'New feature idea', description: 'A longer description of the idea.', category: 'Feature', priority: 'High',
  });
  assert.equal(res.status, 302);

  const created = await prisma.backlogItem.findFirstOrThrow({ where: { title: 'New feature idea' } });
  assert.equal(created.number, 6);
  assert.equal(created.status, 'Backlog');
  assert.equal(created.priority, 'High');
  assert.equal(created.actualFixDate, null);
});

test('GET /api/admin/backlog/:id shows the full item with an edit form pre-filled', async () => {
  const item = await prisma.backlogItem.create({
    data: { number: 10, title: 'Detail test item', description: 'The full description text.', category: 'Tech Debt', priority: 'Medium', status: 'Backlog', dateAdded: new Date() },
  });
  const agent = await loggedInAdminAgent();
  const res = await agent.get(`/api/admin/backlog/${item.id}`);
  assert.equal(res.status, 200);
  assert.match(res.text, /value="Detail test item"/);
  assert.match(res.text, /The full description text\./);
});

test('GET /api/admin/backlog/:id 404s for an unknown id', async () => {
  const agent = await loggedInAdminAgent();
  const res = await agent.get('/api/admin/backlog/does-not-exist');
  assert.equal(res.status, 404);
});

test('POST /api/admin/backlog/:id/edit moving status to Done stamps actualFixDate', async () => {
  const item = await prisma.backlogItem.create({
    data: { number: 11, title: 'Item to close', description: 'desc', category: 'Bug', priority: 'Low', status: 'Backlog', dateAdded: new Date() },
  });
  const agent = await loggedInAdminAgent();
  const res = await agent.post(`/api/admin/backlog/${item.id}/edit`).send({
    title: 'Item to close', description: 'desc', category: 'Bug', priority: 'Low', status: 'Done',
  });
  assert.equal(res.status, 302);

  const updated = await prisma.backlogItem.findUniqueOrThrow({ where: { id: item.id } });
  assert.equal(updated.status, 'Done');
  assert.ok(updated.actualFixDate !== null);
});

test('POST /api/admin/backlog/:id/edit reopening a Done item clears actualFixDate', async () => {
  const item = await prisma.backlogItem.create({
    data: { number: 12, title: 'Reopened item', description: 'desc', category: 'Bug', priority: 'Low', status: 'Done', dateAdded: new Date(), actualFixDate: new Date() },
  });
  const agent = await loggedInAdminAgent();
  const res = await agent.post(`/api/admin/backlog/${item.id}/edit`).send({
    title: 'Reopened item', description: 'desc', category: 'Bug', priority: 'Low', status: 'Backlog',
  });
  assert.equal(res.status, 302);

  const updated = await prisma.backlogItem.findUniqueOrThrow({ where: { id: item.id } });
  assert.equal(updated.status, 'Backlog');
  assert.equal(updated.actualFixDate, null);
});

test('POST /api/admin/backlog/:id/edit does not re-stamp actualFixDate on a no-op Done save', async () => {
  const originalFixDate = new Date('2026-01-01T00:00:00.000Z');
  const item = await prisma.backlogItem.create({
    data: { number: 13, title: 'Already done', description: 'desc', category: 'Bug', priority: 'Low', status: 'Done', dateAdded: new Date(), actualFixDate: originalFixDate },
  });
  const agent = await loggedInAdminAgent();
  const res = await agent.post(`/api/admin/backlog/${item.id}/edit`).send({
    title: 'Already done (edited title)', description: 'desc', category: 'Bug', priority: 'Low', status: 'Done',
  });
  assert.equal(res.status, 302);

  const updated = await prisma.backlogItem.findUniqueOrThrow({ where: { id: item.id } });
  assert.equal(updated.title, 'Already done (edited title)');
  assert.equal(updated.actualFixDate?.toISOString(), originalFixDate.toISOString());
});

test('backlog routes require a platform-admin session', async () => {
  const res1 = await request(app).get('/api/admin/backlog');
  assert.equal(res1.status, 302);
  const res2 = await request(app).post('/api/admin/backlog').send({ title: 'x', description: 'y', category: 'Bug', priority: 'Low' });
  assert.equal(res2.status, 302);
});
