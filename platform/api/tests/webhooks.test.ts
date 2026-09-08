import { test, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildApp } from '../src/app.js';
import { resetTestDatabase } from './helpers/testApp.js';
import { prisma } from '../src/db/client.js';
import { payfastProvider } from '../src/billing/payfastProvider.js';

beforeEach(resetTestDatabase);

async function makeTrialingTenant(email: string) {
  const tenant = await prisma.tenant.create({
    data: { businessName: 'Acme Prints', contactName: 'Jane Doe', email, passwordHash: 'x' },
  });
  const plan = await prisma.plan.findFirstOrThrow({ where: { name: 'Tier 1' } });
  await prisma.subscription.create({
    data: {
      tenantId: tenant.id,
      planId: plan.id,
      status: 'trialing',
      paymentProvider: 'payfast',
      providerSubscriptionId: 'pf-sub-1',
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
  await makeTrialingTenant('jane@acmeprints.co.za');
  mock.method(payfastProvider, 'verifyWebhookSignature', () => true);
  mock.method(payfastProvider, 'parseWebhookEvent', () => ({
    providerSubscriptionId: 'pf-sub-1',
    type: 'payment_succeeded',
  }));

  try {
    const app = buildApp();
    const res = await request(app).post('/api/webhooks/payfast').send({ token: 'pf-sub-1', payment_status: 'COMPLETE' });
    assert.equal(res.status, 200);

    const subscription = await prisma.subscription.findFirst({ where: { providerSubscriptionId: 'pf-sub-1' } });
    assert.equal(subscription?.status, 'active');
  } finally {
    mock.restoreAll();
  }
});

test('POST /api/webhooks/payfast processes a real application/x-www-form-urlencoded ITN body', async () => {
  await makeTrialingTenant('jane@acmeprints.co.za');
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
    return { providerSubscriptionId: 'pf-sub-1', type: 'payment_succeeded' as const };
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

    const subscription = await prisma.subscription.findFirst({ where: { providerSubscriptionId: 'pf-sub-1' } });
    assert.equal(subscription?.status, 'active');
  } finally {
    mock.restoreAll();
  }
});

test('POST /api/webhooks/payfast marks the subscription past_due on a payment_failed event', async () => {
  await makeTrialingTenant('jane@acmeprints.co.za');
  mock.method(payfastProvider, 'verifyWebhookSignature', () => true);
  mock.method(payfastProvider, 'parseWebhookEvent', () => ({
    providerSubscriptionId: 'pf-sub-1',
    type: 'payment_failed',
  }));

  try {
    const app = buildApp();
    const res = await request(app).post('/api/webhooks/payfast').send({ token: 'pf-sub-1', payment_status: 'FAILED' });
    assert.equal(res.status, 200);

    const subscription = await prisma.subscription.findFirst({ where: { providerSubscriptionId: 'pf-sub-1' } });
    assert.equal(subscription?.status, 'past_due');
  } finally {
    mock.restoreAll();
  }
});
