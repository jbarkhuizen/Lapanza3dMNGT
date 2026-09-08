import { test } from 'node:test';
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
  assert.deepEqual(event, { providerSubscriptionId: 'pf-sub-abc123', type: 'payment_succeeded' });
});

test('parseWebhookEvent normalizes a FAILED payment_status to "payment_failed"', () => {
  const provider = createPayfastProvider(config);
  const req = {
    body: { m_payment_id: 'sub_t1', payment_status: 'FAILED', token: 'pf-sub-abc123' },
  } as unknown as Request;
  const event = provider.parseWebhookEvent(req);
  assert.deepEqual(event, { providerSubscriptionId: 'pf-sub-abc123', type: 'payment_failed' });
});

test('parseWebhookEvent returns null instead of throwing on a missing body', () => {
  const provider = createPayfastProvider(config);

  const missingBodyReq = { body: undefined } as unknown as Request;
  assert.equal(provider.parseWebhookEvent(missingBodyReq), null);

  const nullBodyReq = { body: null } as unknown as Request;
  assert.equal(provider.parseWebhookEvent(nullBodyReq), null);
});
