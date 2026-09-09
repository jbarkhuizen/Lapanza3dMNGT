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
  // below resolve this row via the mocked event's own `tenantId` field,
  // the same way a real first-contact PayFast webhook would.
  await prisma.subscription.create({
    data: {
      tenantId: tenant.id,
      planId: plan.id,
      status: 'trialing',
      paymentProvider: 'payfast',
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
  });
  return tenant;
}

test('POST /api/webhooks/payfast rejects a payload with an invalid signature', async () => {
  const app = buildApp();
  const res = await request(app).post('/api/webhooks/payfast').send({
    token: 'pf-sub-1', payment_status: 'COMPLETE', signature: 'not-a-real-signature',
  });
  assert.equal(res.status, 400);
});

test('POST /api/webhooks/payfast updates the matching subscription to active on a valid COMPLETE event', async () => {
  const tenant = await makeTrialingTenant('jane@acmeprints.co.za');
  mock.method(payfastProvider, 'verifyWebhookSignature', () => true);
  mock.method(payfastProvider, 'parseWebhookEvent', () => ({
    providerSubscriptionId: 'pf-sub-1',
    tenantId: tenant.id,
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
  const tenant = await makeTrialingTenant('jane@acmeprints.co.za');
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
    return { providerSubscriptionId: 'pf-sub-1', tenantId: tenant.id, type: 'payment_succeeded' as const };
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
  const tenant = await makeTrialingTenant('jane@acmeprints.co.za');
  mock.method(payfastProvider, 'verifyWebhookSignature', () => true);
  mock.method(payfastProvider, 'parseWebhookEvent', () => ({
    providerSubscriptionId: 'pf-sub-1',
    tenantId: tenant.id,
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

test('POST /api/webhooks/payfast resolves the FIRST event for a fresh subscription via tenantId and persists providerSubscriptionId', async () => {
  const tenant = await makeTrialingTenant('jane@acmeprints.co.za');
  // Confirm the fixture really has no providerSubscriptionId yet — this is
  // the precondition that makes the tenantId-based resolution path in
  // applyEvent() necessary in the first place.
  const before = await prisma.subscription.findUnique({ where: { tenantId: tenant.id } });
  assert.equal(before?.providerSubscriptionId, null);

  mock.method(payfastProvider, 'verifyWebhookSignature', () => true);
  mock.method(payfastProvider, 'parseWebhookEvent', () => ({
    providerSubscriptionId: 'pf-sub-first-contact',
    tenantId: tenant.id,
    type: 'payment_succeeded',
  }));

  try {
    const app = buildApp();
    const res = await request(app)
      .post('/api/webhooks/payfast')
      .send({ token: 'pf-sub-first-contact', payment_status: 'COMPLETE', m_payment_id: `sub_${tenant.id}` });
    assert.equal(res.status, 200);

    const subscription = await prisma.subscription.findUnique({ where: { tenantId: tenant.id } });
    assert.equal(subscription?.status, 'active');
    assert.equal(subscription?.providerSubscriptionId, 'pf-sub-first-contact');
  } finally {
    mock.restoreAll();
  }
});

test('POST /api/webhooks/paypal resolves via providerSubscriptionId alone (tenantId stays undefined for PayPal events), and a concurrent PayFast first-contact event resolves via its own tenantId without cross-talk', async () => {
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
  const payfastTenant = await makeTrialingTenant('payfast-tenant@acmeprints.co.za');

  mock.method(paypalProvider, 'verifyWebhookSignature', () => true);
  mock.method(paypalProvider, 'parseWebhookEvent', () => ({
    providerSubscriptionId: 'PP-SUB-1',
    // tenantId intentionally absent — PayPal's adapter never sets it.
    type: 'payment_succeeded' as const,
  }));
  mock.method(payfastProvider, 'verifyWebhookSignature', () => true);
  mock.method(payfastProvider, 'parseWebhookEvent', () => ({
    providerSubscriptionId: 'PF-SUB-1',
    tenantId: payfastTenant.id,
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

test('a second payment_failed event for an already past_due subscription does NOT reset pastDueSince', async () => {
  const tenant = await makeTrialingTenant('jane@acmeprints.co.za');
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
