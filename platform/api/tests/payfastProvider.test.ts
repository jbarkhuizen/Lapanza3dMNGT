import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type { Request } from 'express';
import { createPayfastProvider } from '../src/billing/payfastProvider.js';

const config = {
  merchantId: '10000100',
  merchantKey: '46f0cd694581a',
  passphrase: 'jt7NOE43FZPn',
  live: false,
};

test('createSubscriptionCheckout builds a redirect URL with a correctly-signed query string', async () => {
  const provider = createPayfastProvider(config);
  const { redirectUrl } = await provider.createSubscriptionCheckout({
    tenantId: 't1',
    plan: { id: 'p1', name: 'Tier 1', monthlyPrice: '25.00' },
    trialDays: 14,
    returnUrl: 'https://barkie.co.za/app/billing/complete',
    webhookUrl: 'https://barkie.co.za/api/webhooks/payfast',
  });

  const url = new URL(redirectUrl);
  assert.equal(url.origin, 'https://sandbox.payfast.co.za');
  const params = url.searchParams;
  assert.equal(params.get('merchant_id'), '10000100');
  assert.equal(params.get('subscription_type'), '1');
  assert.equal(params.get('recurring_amount'), '25.00');
  assert.equal(params.get('frequency'), '3');
  assert.ok(params.get('billing_date'));
  assert.ok(params.get('signature'));

  // Recompute the signature the same way PayFast does — every non-blank
  // field except "signature", in the order they appear in the query
  // string, URL-encoded (space as "+"), joined with "&", passphrase
  // appended, MD5 hex digest.
  const pairs: string[] = [];
  for (const [key, value] of params.entries()) {
    if (key === 'signature' || value === '') continue;
    pairs.push(`${key}=${encodeURIComponent(value).replace(/%20/g, '+')}`);
  }
  const expected = crypto
    .createHash('md5')
    .update(`${pairs.join('&')}&passphrase=${encodeURIComponent(config.passphrase).replace(/%20/g, '+')}`)
    .digest('hex');
  assert.equal(params.get('signature'), expected);
});

test('verifyWebhookSignature accepts a correctly-signed ITN payload and rejects a tampered one', () => {
  const provider = createPayfastProvider(config);
  const payload: Record<string, string> = {
    m_payment_id: 'sub_t1',
    pf_payment_id: '12345',
    payment_status: 'COMPLETE',
    amount_gross: '25.00',
  };
  const pairs = Object.entries(payload).map(
    ([key, value]) => `${key}=${encodeURIComponent(value).replace(/%20/g, '+')}`,
  );
  const signature = crypto
    .createHash('md5')
    .update(`${pairs.join('&')}&passphrase=${encodeURIComponent(config.passphrase).replace(/%20/g, '+')}`)
    .digest('hex');

  const goodReq = { body: { ...payload, signature } } as unknown as Request;
  assert.equal(provider.verifyWebhookSignature(goodReq), true);

  const tamperedReq = { body: { ...payload, amount_gross: '999.00', signature } } as unknown as Request;
  assert.equal(provider.verifyWebhookSignature(tamperedReq), false);
});

test('verifyWebhookSignature returns false instead of throwing on a missing or malformed body', () => {
  const provider = createPayfastProvider(config);

  const missingBodyReq = { body: undefined } as unknown as Request;
  assert.equal(provider.verifyWebhookSignature(missingBodyReq), false);

  const nullBodyReq = { body: null } as unknown as Request;
  assert.equal(provider.verifyWebhookSignature(nullBodyReq), false);

  const stringBodyReq = { body: 'not-an-object' } as unknown as Request;
  assert.equal(provider.verifyWebhookSignature(stringBodyReq), false);
});

test('parseWebhookEvent normalizes a COMPLETE payment_status to "payment_succeeded"', () => {
  const provider = createPayfastProvider(config);
  const req = {
    body: { m_payment_id: 'sub_t1', payment_status: 'COMPLETE', token: 'pf-sub-abc123' },
  } as unknown as Request;
  const event = provider.parseWebhookEvent(req);
  assert.deepEqual(event, { providerSubscriptionId: 'pf-sub-abc123', tenantId: 't1', type: 'payment_succeeded' });
});

test('parseWebhookEvent normalizes a FAILED payment_status to "payment_failed"', () => {
  const provider = createPayfastProvider(config);
  const req = {
    body: { m_payment_id: 'sub_t1', payment_status: 'FAILED', token: 'pf-sub-abc123' },
  } as unknown as Request;
  const event = provider.parseWebhookEvent(req);
  assert.deepEqual(event, { providerSubscriptionId: 'pf-sub-abc123', tenantId: 't1', type: 'payment_failed' });
});

test('parseWebhookEvent returns null instead of throwing on a missing body', () => {
  const provider = createPayfastProvider(config);

  const missingBodyReq = { body: undefined } as unknown as Request;
  assert.equal(provider.parseWebhookEvent(missingBodyReq), null);

  const nullBodyReq = { body: null } as unknown as Request;
  assert.equal(provider.parseWebhookEvent(nullBodyReq), null);
});

test('parseWebhookEvent extracts tenantId from a sub_-prefixed m_payment_id', () => {
  const provider = createPayfastProvider(config);
  const req = {
    body: { m_payment_id: 'sub_abc123', payment_status: 'COMPLETE', token: 'pf-sub-1' },
  } as unknown as Request;
  const event = provider.parseWebhookEvent(req);
  assert.equal(event?.tenantId, 'abc123');
});

test('parseWebhookEvent leaves tenantId undefined when m_payment_id does not start with sub_', () => {
  const provider = createPayfastProvider(config);
  const req = {
    body: { m_payment_id: 'something-else', payment_status: 'COMPLETE', token: 'pf-sub-1' },
  } as unknown as Request;
  const event = provider.parseWebhookEvent(req);
  assert.equal(event?.tenantId, undefined);
});

test('cancelSubscription PUTs to the PayFast subscriptions API with a signed header set', async () => {
  const provider = createPayfastProvider(config);
  const calls: Array<{ url: string; init: Record<string, unknown> }> = [];
  mock.method(globalThis, 'fetch', async (url: string, init: Record<string, unknown>) => {
    calls.push({ url, init });
    return { ok: true, text: async () => '' } as Response;
  });

  try {
    await provider.cancelSubscription('pf-sub-1');

    assert.equal(calls.length, 1);
    const { url, init } = calls[0];
    assert.ok(url.startsWith('https://api.payfast.co.za/subscriptions/pf-sub-1/cancel'));
    assert.ok(url.includes('testing=true'), 'sandbox mode should include the testing=true query param');
    assert.equal(init.method, 'PUT');
    const headers = init.headers as Record<string, string>;
    assert.equal(headers['merchant-id'], config.merchantId);
    assert.equal(headers.version, 'v1');
    assert.ok(headers.timestamp);
    assert.ok(headers.signature);
  } finally {
    mock.restoreAll();
  }
});

test('cancelSubscription throws when the PayFast API responds with a non-ok status', async () => {
  const provider = createPayfastProvider(config);
  mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 500, text: async () => 'boom' }) as Response);

  try {
    await assert.rejects(() => provider.cancelSubscription('pf-sub-1'));
  } finally {
    mock.restoreAll();
  }
});
