import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { Request } from 'express';
import { createPaypalProvider } from '../src/billing/paypalProvider.js';

const config = {
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
  webhookId: 'test-webhook-id',
  live: false,
};

test('createSubscriptionCheckout gets an access token, creates a plan and a subscription, and returns the approval link', async () => {
  const calls: Array<{ url: string; init: Record<string, unknown> }> = [];
  const fakeFetch = async (url: string, init: Record<string, unknown> = {}) => {
    calls.push({ url, init });
    if (url.endsWith('/v1/oauth2/token')) {
      return { ok: true, json: async () => ({ access_token: 'fake-token' }) };
    }
    if (url.endsWith('/v1/catalogs/products')) {
      return { ok: true, json: async () => ({ id: 'PROD-1' }) };
    }
    if (url.endsWith('/v1/billing/plans')) {
      return { ok: true, json: async () => ({ id: 'PLAN-1' }) };
    }
    if (url.endsWith('/v1/billing/subscriptions')) {
      return {
        ok: true,
        json: async () => ({
          id: 'SUB-1',
          links: [{ rel: 'approve', href: 'https://www.sandbox.paypal.com/approve/SUB-1' }],
        }),
      };
    }
    throw new Error(`Unexpected URL in test: ${url}`);
  };

  const provider = createPaypalProvider(config, fakeFetch as unknown as typeof fetch);
  const { redirectUrl } = await provider.createSubscriptionCheckout({
    tenantId: 't1',
    plan: { id: 'p1', name: 'Tier 1', monthlyPrice: '25.00' },
    trialDays: 14,
    returnUrl: 'https://barkie.co.za/app/billing/complete',
    webhookUrl: 'https://barkie.co.za/api/webhooks/paypal',
  });

  assert.equal(redirectUrl, 'https://www.sandbox.paypal.com/approve/SUB-1');
  assert.equal(calls.length, 4);
  const subscriptionCall = calls[3];
  const body = JSON.parse(subscriptionCall.init.body as string);
  assert.equal(body.plan_id, 'PLAN-1');
});

test('verifyWebhookSignature calls the verify-webhook-signature endpoint and returns true on SUCCESS', async () => {
  const calls: Array<{ url: string; init: Record<string, unknown> }> = [];
  const fakeFetch = async (url: string, init: Record<string, unknown> = {}) => {
    calls.push({ url, init });
    if (url.endsWith('/v1/oauth2/token')) {
      return { ok: true, json: async () => ({ access_token: 'fake-token' }) } as Response;
    }
    if (url.endsWith('/v1/notifications/verify-webhook-signature')) {
      return { ok: true, json: async () => ({ verification_status: 'SUCCESS' }) } as Response;
    }
    throw new Error(`Unexpected URL in test: ${url}`);
  };
  const provider = createPaypalProvider(config, fakeFetch as unknown as typeof fetch);

  const req = {
    headers: {
      'paypal-transmission-id': 'tid',
      'paypal-transmission-time': 'ttime',
      'paypal-transmission-sig': 'tsig',
      'paypal-cert-url': 'https://api.paypal.com/cert',
      'paypal-auth-algo': 'SHA256withRSA',
    },
    body: { id: 'WH-EVENT-1', event_type: 'PAYMENT.SALE.COMPLETED' },
  } as unknown as Request;

  const result = await provider.verifyWebhookSignature(req);
  assert.equal(result, true);

  // Not just "a request happened" — the exact per-transmission headers must
  // land in the verify-webhook-signature body under PayPal's field names,
  // since a mismapped field here would make the check pass or fail against
  // the wrong signature.
  const verifyCall = calls.find((c) => c.url.endsWith('/v1/notifications/verify-webhook-signature'));
  assert.ok(verifyCall, 'expected a call to verify-webhook-signature');
  const verifyBody = JSON.parse(verifyCall!.init.body as string);
  assert.equal(verifyBody.transmission_id, 'tid');
  assert.equal(verifyBody.transmission_time, 'ttime');
  assert.equal(verifyBody.transmission_sig, 'tsig');
  assert.equal(verifyBody.cert_url, 'https://api.paypal.com/cert');
  assert.equal(verifyBody.auth_algo, 'SHA256withRSA');
  assert.equal(verifyBody.webhook_id, 'test-webhook-id');
  assert.deepEqual(verifyBody.webhook_event, { id: 'WH-EVENT-1', event_type: 'PAYMENT.SALE.COMPLETED' });
});

test('verifyWebhookSignature returns false on FAILURE', async () => {
  const fakeFetch = async (url: string) => {
    if (url.endsWith('/v1/oauth2/token')) {
      return { ok: true, json: async () => ({ access_token: 'fake-token' }) } as Response;
    }
    return { ok: true, json: async () => ({ verification_status: 'FAILURE' }) } as Response;
  };
  const provider = createPaypalProvider(config, fakeFetch as unknown as typeof fetch);
  const req = { headers: {}, body: {} } as unknown as Request;
  const result = await provider.verifyWebhookSignature(req);
  assert.equal(result, false);
});

test('parseWebhookEvent normalizes PAYMENT.SALE.COMPLETED to "payment_succeeded"', () => {
  const provider = createPaypalProvider(config, (async () => ({})) as unknown as typeof fetch);
  const req = {
    body: { event_type: 'PAYMENT.SALE.COMPLETED', resource: { billing_agreement_id: 'SUB-1' } },
  } as unknown as Request;
  const event = provider.parseWebhookEvent(req);
  assert.deepEqual(event, { providerSubscriptionId: 'SUB-1', type: 'payment_succeeded' });
});

test('parseWebhookEvent normalizes BILLING.SUBSCRIPTION.CANCELLED to "canceled"', () => {
  const provider = createPaypalProvider(config, (async () => ({})) as unknown as typeof fetch);
  const req = {
    body: { event_type: 'BILLING.SUBSCRIPTION.CANCELLED', resource: { id: 'SUB-1' } },
  } as unknown as Request;
  const event = provider.parseWebhookEvent(req);
  assert.deepEqual(event, { providerSubscriptionId: 'SUB-1', type: 'canceled' });
});

test('parseWebhookEvent returns null instead of throwing on a missing body', () => {
  const provider = createPaypalProvider(config, (async () => ({})) as unknown as typeof fetch);

  const missingBodyReq = { body: undefined } as unknown as Request;
  assert.equal(provider.parseWebhookEvent(missingBodyReq), null);

  const nullBodyReq = { body: null } as unknown as Request;
  assert.equal(provider.parseWebhookEvent(nullBodyReq), null);
});
