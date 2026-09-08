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
