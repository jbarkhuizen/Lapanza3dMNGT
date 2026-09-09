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
    subscriptionId: 'sub-row-1',
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
  // The initial charge at checkout must be R0 (a genuine free trial) —
  // distinct from `recurring_amount`, the real ongoing price that only
  // applies from `billing_date`. See PayFast's "Can a subscription be set
  // up with an initial zero amount 'payment'?" support article.
  assert.equal(params.get('amount'), '0.00');
  assert.equal(params.get('recurring_amount'), '25.00');
  assert.equal(params.get('frequency'), '3');
  // m_payment_id must be built from the pre-generated subscription row id,
  // not the tenant id — this is the id PayFast will echo back on every
  // ITN, and it must uniquely identify this row so a stale event from a
  // dead, since-deleted row can never resolve onto a resubscribed tenant's
  // new row.
  assert.equal(params.get('m_payment_id'), 'sub_sub-row-1');
  assert.ok(params.get('billing_date'));
  assert.ok(params.get('signature'));

  // Recompute the signature the same way PayFast does — every non-blank
  // field except "signature", in the order they appear in the query
  // string, URL-encoded (space as "+"), joined with "&", passphrase
  // appended, MD5 hex digest.
  const pairs: string[] = [];
  for (const [key, value] of params.entries()) {
    if (key === 'signature' || value === '') continue;
    pairs.push(`${key}=${phpUrlencode(value)}`);
  }
  const expected = crypto
    .createHash('md5')
    .update(`${pairs.join('&')}&passphrase=${phpUrlencode(config.passphrase)}`)
    .digest('hex');
  assert.equal(params.get('signature'), expected);
});

// Reference encoder matching PHP's urlencode() — what PayFast's own
// signing/verification side actually runs values through. It differs from
// plain encodeURIComponent in two ways: spaces become "+" (not "%20"), and
// `! ~ * ' ( )` are percent-encoded (encodeURIComponent leaves those six
// unescaped). Using plain encodeURIComponent here would make this reference
// implementation share the same bug as the code under test, so it wouldn't
// discriminate a real mismatch.
function phpUrlencode(value: string): string {
  return encodeURIComponent(value)
    .replace(/%20/g, '+')
    .replace(/[!'()*~]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

function signPayload(payload: Record<string, string>): string {
  const pairs = Object.entries(payload).map(([key, value]) => `${key}=${phpUrlencode(value)}`);
  return crypto
    .createHash('md5')
    .update(`${pairs.join('&')}&passphrase=${phpUrlencode(config.passphrase)}`)
    .digest('hex');
}

test('verifyWebhookSignature accepts a correctly-signed ITN payload confirmed VALID by PayFast, and rejects a tampered one', async () => {
  const provider = createPayfastProvider(config);
  const payload: Record<string, string> = {
    m_payment_id: 'sub_t1',
    pf_payment_id: '12345',
    payment_status: 'COMPLETE',
    amount_gross: '25.00',
  };
  const signature = signPayload(payload);

  const calls: Array<{ url: string; init: Record<string, unknown> }> = [];
  mock.method(globalThis, 'fetch', async (url: string, init: Record<string, unknown>) => {
    calls.push({ url, init });
    return { text: async () => 'VALID' } as Response;
  });

  try {
    const goodReq = { body: { ...payload, signature } } as unknown as Request;
    assert.equal(await provider.verifyWebhookSignature(goodReq), true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://sandbox.payfast.co.za/eng/query/validate');

    const tamperedReq = { body: { ...payload, amount_gross: '999.00', signature } } as unknown as Request;
    assert.equal(await provider.verifyWebhookSignature(tamperedReq), false);
    // A tampered signature fails the local check and must never reach the
    // postback endpoint — still just the one call from the good request.
    assert.equal(calls.length, 1);
  } finally {
    mock.restoreAll();
  }
});

test('verifyWebhookSignature accepts a correctly-signed ITN payload that carries blank-valued fields (PayFast\'s real ITN rule keeps blanks, unlike the checkout signature which skips them)', async () => {
  const provider = createPayfastProvider(config);
  // Modeled on the official payfast-php-sdk's own NotificationTest.php
  // fixture, which is a genuinely-valid ITN carrying several blank
  // custom_str*/item_description fields.
  const payload: Record<string, string> = {
    m_payment_id: 'sub_t1',
    pf_payment_id: '12345',
    payment_status: 'COMPLETE',
    item_description: '',
    amount_gross: '25.00',
    custom_str1: '',
    custom_str2: '',
  };
  // Recompute the signature per PayFast's real ITN rule: every field
  // except "signature", IN THE ORDER RECEIVED, with blank values INCLUDED
  // (not skipped) — i.e. exactly what signPayload() below already does.
  const signature = signPayload(payload);

  mock.method(globalThis, 'fetch', async () => ({ text: async () => 'VALID' }) as Response);

  try {
    const req = { body: { ...payload, signature } } as unknown as Request;
    assert.equal(await provider.verifyWebhookSignature(req), true);
  } finally {
    mock.restoreAll();
  }
});

test('verifyWebhookSignature accepts an ITN payload whose fields contain characters PHP\'s urlencode() escapes but encodeURIComponent does not (! ~ * \' ( ))', async () => {
  const provider = createPayfastProvider(config);
  // name_first/name_last and item_name/item_description are free text
  // PayFast passes straight through from what the payer or merchant
  // entered — an apostrophe in a surname, or parentheses/asterisks in a
  // description, are entirely realistic. PHP's urlencode() percent-encodes
  // all of "! ~ * ' ( )", but plain encodeURIComponent leaves them as-is;
  // if payfastEncode ever regresses to plain encodeURIComponent, this
  // payload's hash diverges from PayFast's real one and this assertion
  // fails.
  const payload: Record<string, string> = {
    m_payment_id: 'sub_t1',
    pf_payment_id: '12345',
    payment_status: 'COMPLETE',
    amount_gross: '25.00',
    name_first: "O'Brien",
    item_name: 'Barkie subscription (Pro)*',
  };
  const signature = signPayload(payload);

  mock.method(globalThis, 'fetch', async () => ({ text: async () => 'VALID' }) as Response);

  try {
    const req = { body: { ...payload, signature } } as unknown as Request;
    assert.equal(await provider.verifyWebhookSignature(req), true);
  } finally {
    mock.restoreAll();
  }
});

test('verifyWebhookSignature returns false when the local signature is correct but PayFast\'s postback validation does not confirm VALID', async () => {
  const provider = createPayfastProvider(config);
  const payload: Record<string, string> = {
    m_payment_id: 'sub_t1',
    pf_payment_id: '12345',
    payment_status: 'COMPLETE',
    amount_gross: '25.00',
  };
  const signature = signPayload(payload);

  mock.method(globalThis, 'fetch', async () => ({ text: async () => 'INVALID' }) as Response);

  try {
    const req = { body: { ...payload, signature } } as unknown as Request;
    assert.equal(await provider.verifyWebhookSignature(req), false);
  } finally {
    mock.restoreAll();
  }
});

test('verifyWebhookSignature returns false instead of throwing on a missing or malformed body', async () => {
  const provider = createPayfastProvider(config);

  const missingBodyReq = { body: undefined } as unknown as Request;
  assert.equal(await provider.verifyWebhookSignature(missingBodyReq), false);

  const nullBodyReq = { body: null } as unknown as Request;
  assert.equal(await provider.verifyWebhookSignature(nullBodyReq), false);

  const stringBodyReq = { body: 'not-an-object' } as unknown as Request;
  assert.equal(await provider.verifyWebhookSignature(stringBodyReq), false);
});

test('parseWebhookEvent normalizes a COMPLETE payment_status to "payment_succeeded"', () => {
  const provider = createPayfastProvider(config);
  const req = {
    body: { m_payment_id: 'sub_row-1', payment_status: 'COMPLETE', token: 'pf-sub-abc123' },
  } as unknown as Request;
  const event = provider.parseWebhookEvent(req);
  assert.deepEqual(event, { providerSubscriptionId: 'pf-sub-abc123', subscriptionId: 'row-1', type: 'payment_succeeded' });
});

test('parseWebhookEvent normalizes a FAILED payment_status to "payment_failed"', () => {
  const provider = createPayfastProvider(config);
  const req = {
    body: { m_payment_id: 'sub_row-1', payment_status: 'FAILED', token: 'pf-sub-abc123' },
  } as unknown as Request;
  const event = provider.parseWebhookEvent(req);
  assert.deepEqual(event, { providerSubscriptionId: 'pf-sub-abc123', subscriptionId: 'row-1', type: 'payment_failed' });
});

test('parseWebhookEvent returns null instead of throwing on a missing body', () => {
  const provider = createPayfastProvider(config);

  const missingBodyReq = { body: undefined } as unknown as Request;
  assert.equal(provider.parseWebhookEvent(missingBodyReq), null);

  const nullBodyReq = { body: null } as unknown as Request;
  assert.equal(provider.parseWebhookEvent(nullBodyReq), null);
});

test('parseWebhookEvent extracts subscriptionId from a sub_-prefixed m_payment_id', () => {
  const provider = createPayfastProvider(config);
  const req = {
    body: { m_payment_id: 'sub_abc123', payment_status: 'COMPLETE', token: 'pf-sub-1' },
  } as unknown as Request;
  const event = provider.parseWebhookEvent(req);
  assert.equal(event?.subscriptionId, 'abc123');
});

test('parseWebhookEvent leaves subscriptionId undefined when m_payment_id does not start with sub_', () => {
  const provider = createPayfastProvider(config);
  const req = {
    body: { m_payment_id: 'something-else', payment_status: 'COMPLETE', token: 'pf-sub-1' },
  } as unknown as Request;
  const event = provider.parseWebhookEvent(req);
  assert.equal(event?.subscriptionId, undefined);
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
