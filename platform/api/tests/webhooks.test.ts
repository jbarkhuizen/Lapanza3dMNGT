import { test, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildApp } from '../src/app.js';
import { resetTestDatabase } from './helpers/testApp.js';
import { prisma } from '../src/db/client.js';
import { payfastProvider } from '../src/billing/payfastProvider.js';
import { paypalProvider } from '../src/billing/paypalProvider.js';

beforeEach(resetTestDatabase);

async function makeTrialingTenant(email: string) {
  const tenant = await prisma.tenant.create({
    data: { businessName: 'Acme Prints', contactName: 'Jane Doe', email, passwordHash: 'x' },
  });
  const plan = await prisma.plan.findFirstOrThrow({ where: { name: 'Tier 1' } });
  // No providerSubscriptionId set here — PayFast never returns one
  // synchronously at checkout, so it's only persisted once the first
  // webhook for this subscription actually arrives (Step 9's fix). Tests
  // below resolve this row via the mocked event's own `subscriptionId`
  // field — the Subscription row's own primary-key id, which is what
  // checkout now embeds in m_payment_id, the same way a real first-contact
  // PayFast webhook would.
  const subscription = await prisma.subscription.create({
    data: {
      tenantId: tenant.id,
      planId: plan.id,
      status: 'trialing',
      paymentProvider: 'payfast',
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
  });
  return { tenant, subscriptionId: subscription.id };
}

test('POST /api/webhooks/payfast rejects a payload with an invalid signature', async () => {
  const app = buildApp();
  const res = await request(app).post('/api/webhooks/payfast').send({
    token: 'pf-sub-1', payment_status: 'COMPLETE', signature: 'not-a-real-signature',
  });
  assert.equal(res.status, 400);
});

test('POST /api/webhooks/payfast updates the matching subscription to active on a valid COMPLETE event', async () => {
  const { tenant, subscriptionId } = await makeTrialingTenant('jane@acmeprints.co.za');
  mock.method(payfastProvider, 'verifyWebhookSignature', () => true);
  mock.method(payfastProvider, 'parseWebhookEvent', () => ({
    providerSubscriptionId: 'pf-sub-1',
    subscriptionId,
    type: 'payment_succeeded',
  }));

  try {
    const app = buildApp();
    const res = await request(app).post('/api/webhooks/payfast').send({ token: 'pf-sub-1', payment_status: 'COMPLETE' });
    assert.equal(res.status, 200);

    const subscription = await prisma.subscription.findUnique({ where: { tenantId: tenant.id } });
    assert.equal(subscription?.status, 'active');
  } finally {
    mock.restoreAll();
  }
});

test('POST /api/webhooks/payfast processes a real application/x-www-form-urlencoded ITN body', async () => {
  const { tenant, subscriptionId } = await makeTrialingTenant('jane@acmeprints.co.za');
  mock.method(payfastProvider, 'verifyWebhookSignature', () => true);
  // Assert on the real req.body here (rather than ignoring it like a plain
  // stub would) so this test actually fails if express.urlencoded() isn't
  // registered and req.body comes through empty/undefined — proving the
  // form-urlencoded content-type path is really parsed, not just that the
  // route responds 200.
  mock.method(payfastProvider, 'parseWebhookEvent', (req: import('express').Request) => {
    assert.equal(typeof req.body, 'object');
    assert.equal(req.body.token, 'pf-sub-1');
    assert.equal(req.body.payment_status, 'COMPLETE');
    return { providerSubscriptionId: 'pf-sub-1', subscriptionId, type: 'payment_succeeded' as const };
  });

  try {
    const app = buildApp();
    // PayFast's real ITN arrives form-urlencoded, not JSON. `.type('form')`
    // makes supertest send this with Content-Type: application/x-www-form-urlencoded,
    // exercising the same content-type path a real ITN request would hit.
    const res = await request(app)
      .post('/api/webhooks/payfast')
      .type('form')
      .send({ token: 'pf-sub-1', payment_status: 'COMPLETE' });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);

    const subscription = await prisma.subscription.findUnique({ where: { tenantId: tenant.id } });
    assert.equal(subscription?.status, 'active');
  } finally {
    mock.restoreAll();
  }
});

test('POST /api/webhooks/payfast marks the subscription past_due on a payment_failed event', async () => {
  const { tenant, subscriptionId } = await makeTrialingTenant('jane@acmeprints.co.za');
  mock.method(payfastProvider, 'verifyWebhookSignature', () => true);
  mock.method(payfastProvider, 'parseWebhookEvent', () => ({
    providerSubscriptionId: 'pf-sub-1',
    subscriptionId,
    type: 'payment_failed',
  }));

  try {
    const app = buildApp();
    const res = await request(app).post('/api/webhooks/payfast').send({ token: 'pf-sub-1', payment_status: 'FAILED' });
    assert.equal(res.status, 200);

    const subscription = await prisma.subscription.findUnique({ where: { tenantId: tenant.id } });
    assert.equal(subscription?.status, 'past_due');
  } finally {
    mock.restoreAll();
  }
});

test('POST /api/webhooks/payfast resolves the FIRST event for a fresh subscription via its row id and persists providerSubscriptionId', async () => {
  const { tenant, subscriptionId } = await makeTrialingTenant('jane@acmeprints.co.za');
  // Confirm the fixture really has no providerSubscriptionId yet — this is
  // the precondition that makes the id-based first-contact resolution path
  // in applyEvent() necessary in the first place.
  const before = await prisma.subscription.findUnique({ where: { tenantId: tenant.id } });
  assert.equal(before?.providerSubscriptionId, null);

  mock.method(payfastProvider, 'verifyWebhookSignature', () => true);
  mock.method(payfastProvider, 'parseWebhookEvent', () => ({
    providerSubscriptionId: 'pf-sub-first-contact',
    subscriptionId,
    type: 'payment_succeeded',
  }));

  try {
    const app = buildApp();
    const res = await request(app)
      .post('/api/webhooks/payfast')
      .send({ token: 'pf-sub-first-contact', payment_status: 'COMPLETE', m_payment_id: `sub_${subscriptionId}` });
    assert.equal(res.status, 200);

    const subscription = await prisma.subscription.findUnique({ where: { tenantId: tenant.id } });
    assert.equal(subscription?.status, 'active');
    assert.equal(subscription?.providerSubscriptionId, 'pf-sub-first-contact');
  } finally {
    mock.restoreAll();
  }
});

test('POST /api/webhooks/paypal resolves via providerSubscriptionId alone (subscriptionId stays undefined for PayPal events), and a concurrent PayFast first-contact event resolves via its own row id without cross-talk', async () => {
  // PayPal tenant: providerSubscriptionId was already captured synchronously
  // at checkout (Step 6/7), so this row starts with it set, unlike the
  // PayFast fixture from makeTrialingTenant above.
  const paypalTenant = await prisma.tenant.create({
    data: { businessName: 'PayPal Co', contactName: 'Pat Doe', email: 'paypal-tenant@acmeprints.co.za', passwordHash: 'x' },
  });
  const plan = await prisma.plan.findFirstOrThrow({ where: { name: 'Tier 1' } });
  await prisma.subscription.create({
    data: {
      tenantId: paypalTenant.id,
      planId: plan.id,
      status: 'trialing',
      paymentProvider: 'paypal',
      providerSubscriptionId: 'PP-SUB-1',
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
  });

  // PayFast tenant: first-contact fixture, no providerSubscriptionId yet.
  const { tenant: payfastTenant, subscriptionId: payfastSubscriptionId } = await makeTrialingTenant(
    'payfast-tenant@acmeprints.co.za',
  );

  mock.method(paypalProvider, 'verifyWebhookSignature', () => true);
  mock.method(paypalProvider, 'parseWebhookEvent', () => ({
    providerSubscriptionId: 'PP-SUB-1',
    // subscriptionId intentionally absent — PayPal's adapter never sets it.
    type: 'payment_succeeded' as const,
  }));
  mock.method(payfastProvider, 'verifyWebhookSignature', () => true);
  mock.method(payfastProvider, 'parseWebhookEvent', () => ({
    providerSubscriptionId: 'PF-SUB-1',
    subscriptionId: payfastSubscriptionId,
    type: 'payment_succeeded' as const,
  }));

  try {
    const app = buildApp();
    const paypalRes = await request(app).post('/api/webhooks/paypal').send({ event_type: 'PAYMENT.SALE.COMPLETED' });
    assert.equal(paypalRes.status, 200);
    const payfastRes = await request(app).post('/api/webhooks/payfast').send({ token: 'PF-SUB-1', payment_status: 'COMPLETE' });
    assert.equal(payfastRes.status, 200);

    const paypalSub = await prisma.subscription.findUnique({ where: { tenantId: paypalTenant.id } });
    assert.equal(paypalSub?.status, 'active');
    assert.equal(paypalSub?.providerSubscriptionId, 'PP-SUB-1', 'the PayPal row must be untouched by the PayFast event');

    const payfastSub = await prisma.subscription.findUnique({ where: { tenantId: payfastTenant.id } });
    assert.equal(payfastSub?.status, 'active');
    assert.equal(payfastSub?.providerSubscriptionId, 'PF-SUB-1', 'the PayFast row must persist its own id, not the PayPal one');
  } finally {
    mock.restoreAll();
  }
});

test('a webhook posted to the PayFast endpoint whose resolved row actually belongs to paypal is dropped (does not mutate it)', async () => {
  // Contrived cross-provider mismatch — e.g. an id collision, or an event
  // simply misrouted to the wrong endpoint. The resolved row belongs to
  // paypal, but this event arrived on the payfast endpoint.
  const tenant = await prisma.tenant.create({
    data: { businessName: 'Acme Prints', contactName: 'Jane Doe', email: 'provider-mismatch@acmeprints.co.za', passwordHash: 'x' },
  });
  const plan = await prisma.plan.findFirstOrThrow({ where: { name: 'Tier 1' } });
  const subscription = await prisma.subscription.create({
    data: {
      tenantId: tenant.id,
      planId: plan.id,
      status: 'trialing',
      paymentProvider: 'paypal',
      providerSubscriptionId: 'PP-SUB-MISMATCH',
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
  });

  mock.method(payfastProvider, 'verifyWebhookSignature', () => true);
  mock.method(payfastProvider, 'parseWebhookEvent', () => ({
    providerSubscriptionId: 'PP-SUB-MISMATCH',
    type: 'payment_succeeded' as const,
  }));

  try {
    const app = buildApp();
    const res = await request(app)
      .post('/api/webhooks/payfast')
      .send({ token: 'PP-SUB-MISMATCH', payment_status: 'COMPLETE' });
    // Webhooks always 200 to acknowledge receipt, even when the event is
    // dropped — see makeWebhookHandler.
    assert.equal(res.status, 200);

    const after = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
    assert.equal(after.status, 'trialing', 'a cross-provider event must not mutate a row belonging to a different provider');
    assert.equal(after.providerSubscriptionId, 'PP-SUB-MISMATCH', 'the row must be completely untouched');
  } finally {
    mock.restoreAll();
  }
});

test('a stale event carrying a DIFFERENT providerSubscriptionId than the one already persisted is ignored (does not mutate the row)', async () => {
  const { tenant, subscriptionId } = await makeTrialingTenant('jane@acmeprints.co.za');
  // Simulate the tenant having already had its first ITN land: the row
  // currently bound to this tenant carries a real providerSubscriptionId.
  await prisma.subscription.update({
    where: { tenantId: tenant.id },
    data: { status: 'active', providerSubscriptionId: 'pf-sub-current' },
  });

  mock.method(payfastProvider, 'verifyWebhookSignature', () => true);
  // A stale/delayed ITN for the SAME row id but naming a
  // providerSubscriptionId that no longer matches what's persisted (e.g.
  // PayFast reissued a token) — defense-in-depth, distinct from the
  // dead-row scenario covered by the resubscribe test below.
  mock.method(payfastProvider, 'parseWebhookEvent', () => ({
    providerSubscriptionId: 'pf-sub-old-dead',
    subscriptionId,
    type: 'canceled' as const,
  }));

  try {
    const app = buildApp();
    const res = await request(app)
      .post('/api/webhooks/payfast')
      .send({ token: 'pf-sub-old-dead', payment_status: 'CANCELLED', m_payment_id: `sub_${subscriptionId}` });
    assert.equal(res.status, 200);

    const subscription = await prisma.subscription.findUnique({ where: { tenantId: tenant.id } });
    assert.equal(subscription?.status, 'active', 'an event naming the wrong providerSubscriptionId must not change status');
    assert.equal(
      subscription?.providerSubscriptionId,
      'pf-sub-current',
      'a mismatched-token event must not overwrite the currently-bound providerSubscriptionId',
    );
  } finally {
    mock.restoreAll();
  }
});

test('a stale ITN carrying a RESUBSCRIBED tenant\'s dead row id resolves to nothing and leaves the new row completely untouched', async () => {
  // This is the actual bug the id-scoped correlation fix closes: a stale
  // ITN belonging to an old (dead) subscription attempt arriving AFTER the
  // tenant resubscribed. Under the old tenantId-based correlation this
  // resolved straight onto the tenant's brand-new row (tenantId is stable
  // across resubscribes) and could corrupt it. With id-scoped correlation
  // the old row's id is gone once deleted, so lookup returns null and the
  // event is silently dropped — no heuristic guard required.
  const { tenant } = await makeTrialingTenant('jane@acmeprints.co.za');
  const rowA = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } });
  const oldRowId = rowA.id;

  // Simulate the exact resubscribe flow billing.ts performs: delete the
  // old row, create an entirely new one with a fresh id (a new checkout
  // attempt after the tenant canceled and came back).
  await prisma.subscription.delete({ where: { id: oldRowId } });
  const plan = await prisma.plan.findFirstOrThrow({ where: { name: 'Tier 1' } });
  const rowB = await prisma.subscription.create({
    data: {
      tenantId: tenant.id,
      planId: plan.id,
      status: 'trialing',
      paymentProvider: 'payfast',
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
  });
  const beforeSnapshot = await prisma.subscription.findUniqueOrThrow({ where: { id: rowB.id } });

  mock.method(payfastProvider, 'verifyWebhookSignature', () => true);
  // A late notification for the OLD, now-deleted row — e.g. its own final
  // COMPLETE or CANCELLED ITN, delayed in transit.
  mock.method(payfastProvider, 'parseWebhookEvent', () => ({
    providerSubscriptionId: 'pf-sub-old-attempt',
    subscriptionId: oldRowId,
    type: 'canceled' as const,
  }));

  try {
    const app = buildApp();
    const res = await request(app)
      .post('/api/webhooks/payfast')
      .send({ token: 'pf-sub-old-attempt', payment_status: 'CANCELLED', m_payment_id: `sub_${oldRowId}` });
    // Webhooks always 200 to acknowledge receipt, even when the event
    // resolves to nothing — see makeWebhookHandler.
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);

    const afterSnapshot = await prisma.subscription.findUniqueOrThrow({ where: { id: rowB.id } });
    assert.deepEqual(afterSnapshot, beforeSnapshot, 'the new row (subscription B) must be completely unchanged by the dead row\'s stale event');
  } finally {
    mock.restoreAll();
  }
});

test('a first-contact event for an already canceled row is ignored (a stale ITN cannot resurrect a deliberately canceled subscription)', async () => {
  const { tenant, subscriptionId } = await makeTrialingTenant('jane@acmeprints.co.za');
  // The tenant canceled — no providerSubscriptionId was ever persisted
  // for this row (matches the fixture's default), and status is now dead.
  await prisma.subscription.update({
    where: { tenantId: tenant.id },
    data: { status: 'canceled' },
  });

  mock.method(payfastProvider, 'verifyWebhookSignature', () => true);
  mock.method(payfastProvider, 'parseWebhookEvent', () => ({
    providerSubscriptionId: 'pf-sub-stale',
    subscriptionId,
    type: 'payment_succeeded' as const,
  }));

  try {
    const app = buildApp();
    const res = await request(app)
      .post('/api/webhooks/payfast')
      .send({ token: 'pf-sub-stale', payment_status: 'COMPLETE', m_payment_id: `sub_${subscriptionId}` });
    assert.equal(res.status, 200);

    const subscription = await prisma.subscription.findUnique({ where: { tenantId: tenant.id } });
    assert.equal(subscription?.status, 'canceled', 'a first-contact event must not resurrect a canceled row');
    assert.equal(subscription?.providerSubscriptionId, null);
  } finally {
    mock.restoreAll();
  }
});

test('a late payment_succeeded event for an already-canceled row with providerSubscriptionId still bound is ignored (does not resurrect it)', async () => {
  // This is the realistic post-cancel state: billing.ts's cancel route
  // calls the provider's cancelSubscription() then just flips status to
  // 'canceled' — it does NOT clear providerSubscriptionId. So unlike the
  // first-contact canceled test above, this row already has its token
  // bound, meaning it passes the token-match guard too. A delayed ITN for
  // an in-flight charge that was already processing when the tenant
  // clicked cancel must still be dropped by the hoisted canceled check.
  const { tenant, subscriptionId } = await makeTrialingTenant('jane@acmeprints.co.za');
  await prisma.subscription.update({
    where: { tenantId: tenant.id },
    data: { status: 'canceled', providerSubscriptionId: 'pf-sub-bound' },
  });
  const beforeSnapshot = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } });

  mock.method(payfastProvider, 'verifyWebhookSignature', () => true);
  // Same subscription, same token — not a stale/mismatched-id event, just
  // a late positive one arriving after the tenant already canceled.
  mock.method(payfastProvider, 'parseWebhookEvent', () => ({
    providerSubscriptionId: 'pf-sub-bound',
    subscriptionId,
    type: 'payment_succeeded' as const,
  }));

  try {
    const app = buildApp();
    const res = await request(app)
      .post('/api/webhooks/payfast')
      .send({ token: 'pf-sub-bound', payment_status: 'COMPLETE', m_payment_id: `sub_${subscriptionId}` });
    assert.equal(res.status, 200);

    const afterSnapshot = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } });
    assert.deepEqual(
      afterSnapshot,
      beforeSnapshot,
      'a late positive event for a bound-token canceled row must leave the row completely unchanged',
    );
  } finally {
    mock.restoreAll();
  }
});

test('a first-contact event for a subscription that self-healed to lapsed DOES bind and reactivate it (the lockout fix)', async () => {
  // Before this fix, the first-contact guard blocked binding onto anything
  // except 'trialing'/'active', which permanently stranded a legitimately-
  // paid subscription whose first real ITN arrived after
  // requireActiveSubscription's trial-expiry self-heal had already flipped
  // it to 'lapsed' (e.g. the charge clears a little later than the grace
  // window allows). Because resolution is now scoped to this exact row's
  // id — not shared across every subscription a tenant has ever had — a
  // 'lapsed' row is safe to resurrect: only 'canceled' (a deliberate
  // tenant action) still refuses first contact.
  const { tenant, subscriptionId } = await makeTrialingTenant('jane@acmeprints.co.za');
  await prisma.subscription.update({
    where: { tenantId: tenant.id },
    data: { status: 'lapsed' },
  });
  const before = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } });
  assert.equal(before.providerSubscriptionId, null);

  mock.method(payfastProvider, 'verifyWebhookSignature', () => true);
  mock.method(payfastProvider, 'parseWebhookEvent', () => ({
    providerSubscriptionId: 'pf-sub-late-first-contact',
    subscriptionId,
    type: 'payment_succeeded' as const,
  }));

  try {
    const app = buildApp();
    const res = await request(app)
      .post('/api/webhooks/payfast')
      .send({ token: 'pf-sub-late-first-contact', payment_status: 'COMPLETE', m_payment_id: `sub_${subscriptionId}` });
    assert.equal(res.status, 200);

    const subscription = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } });
    assert.equal(subscription.status, 'active', 'a lapsed row must be reactivated by its real first-contact event');
    assert.equal(subscription.providerSubscriptionId, 'pf-sub-late-first-contact');
  } finally {
    mock.restoreAll();
  }
});

test('a second payment_failed event for an already past_due subscription does NOT reset pastDueSince', async () => {
  const { tenant } = await makeTrialingTenant('jane@acmeprints.co.za');
  const originalPastDueSince = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
  await prisma.subscription.update({
    where: { tenantId: tenant.id },
    data: { status: 'past_due', providerSubscriptionId: 'pf-sub-1', pastDueSince: originalPastDueSince },
  });

  mock.method(payfastProvider, 'verifyWebhookSignature', () => true);
  mock.method(payfastProvider, 'parseWebhookEvent', () => ({
    providerSubscriptionId: 'pf-sub-1',
    type: 'payment_failed',
  }));

  try {
    const app = buildApp();
    const res = await request(app).post('/api/webhooks/payfast').send({ token: 'pf-sub-1', payment_status: 'FAILED' });
    assert.equal(res.status, 200);

    const subscription = await prisma.subscription.findUnique({ where: { tenantId: tenant.id } });
    assert.equal(subscription?.status, 'past_due');
    // The grace-period clock must NOT reset on the provider's automatic
    // retry of a still-failing charge — this is the fix for the bug the
    // final whole-branch review flagged (I2): repeated retries would
    // otherwise keep pushing pastDueSince forward and a permanently-dead
    // card would never actually reach the lapsed state.
    assert.equal(subscription?.pastDueSince?.getTime(), originalPastDueSince.getTime());
  } finally {
    mock.restoreAll();
  }
});

test('a payment_failed event for a subscription already self-healed to lapsed does NOT reset pastDueSince', async () => {
  const { tenant } = await makeTrialingTenant('jane@acmeprints.co.za');
  const originalPastDueSince = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
  // requireActiveSubscription self-heals status to 'lapsed' (not
  // 'past_due') once the grace window expires — a dunning retry landing
  // after that point must still see the original pastDueSince, not
  // status === 'past_due', or the grace-period clock resets forever
  // (the I2 bug, one state removed).
  await prisma.subscription.update({
    where: { tenantId: tenant.id },
    data: { status: 'lapsed', providerSubscriptionId: 'pf-sub-1', pastDueSince: originalPastDueSince },
  });

  mock.method(payfastProvider, 'verifyWebhookSignature', () => true);
  mock.method(payfastProvider, 'parseWebhookEvent', () => ({
    providerSubscriptionId: 'pf-sub-1',
    type: 'payment_failed',
  }));

  try {
    const app = buildApp();
    const res = await request(app).post('/api/webhooks/payfast').send({ token: 'pf-sub-1', payment_status: 'FAILED' });
    assert.equal(res.status, 200);

    const subscription = await prisma.subscription.findUnique({ where: { tenantId: tenant.id } });
    assert.equal(subscription?.status, 'past_due');
    assert.equal(subscription?.pastDueSince?.getTime(), originalPastDueSince.getTime());
  } finally {
    mock.restoreAll();
  }
});
