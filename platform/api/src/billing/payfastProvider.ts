import crypto from 'node:crypto';
import type { Request } from 'express';
import { env } from '../env.js';
import type { PaymentProvider, NormalizedSubscriptionEvent } from './types.js';

interface PayfastConfig {
  merchantId: string;
  merchantKey: string;
  passphrase: string;
  live: boolean;
}

// PayFast's signing/verification side is PHP, and it builds the
// string-to-hash with PHP's urlencode() (see PayFast's own signature
// examples and the payfast-php-sdk's Auth::generateSignature /
// Notification::dataToString, both of which run every value through
// urlencode()). encodeURIComponent is NOT equivalent to PHP's urlencode:
// both encode spaces differently (%20 vs "+", handled by the .replace
// below), but encodeURIComponent additionally leaves `! ~ * ' ( )`
// unescaped while urlencode percent-encodes all six. Any field containing
// one of those characters — an item description with "()", a payer's name
// like "O'Brien" — would otherwise hash to a different string on our side
// than on PayFast's, silently breaking both outbound checkout signing and
// inbound ITN verification.
function payfastEncode(value: string): string {
  return encodeURIComponent(value)
    .replace(/%20/g, '+')
    .replace(/[!'()*~]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

function buildSignature(fields: Record<string, string>, passphrase: string): string {
  const pairs: string[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (key === 'signature' || value === '' || value === undefined) continue;
    pairs.push(`${key}=${payfastEncode(value)}`);
  }
  const paramString = `${pairs.join('&')}&passphrase=${payfastEncode(passphrase)}`;
  return crypto.createHash('md5').update(paramString).digest('hex');
}

// ITN (webhook/notify) signature validation uses a DIFFERENT rule from the
// outbound checkout signature above — confirmed against the official
// payfast-php-sdk (github.com/Payfast/payfast-php-sdk), specifically
// Notification::dataToString / Notification::pfValidSignature in
// lib/PaymentIntegrations/Notification.php: every field PayFast posted is
// included, IN THE ORDER RECEIVED, except "signature" itself — and
// critically, BLANK values are KEPT, not skipped (unlike the checkout
// signature's `if (!empty($value))` skip in Auth::generateSignature). The
// SDK's own test fixture (tests/PaymentIntegrations/NotificationTest.php)
// is a genuinely-valid ITN payload carrying nine blank
// custom_str*/custom_int*/item_description fields, still signed correctly
// with them included. No value trimming happens on this path either — the
// SDK only applies stripslashes() (a PHP magic-quotes artifact with no
// meaningful Node equivalent, since this body never passed through PHP's
// magic quotes in the first place).
function buildItnSignature(fields: Record<string, string>, passphrase: string): string {
  const pairs: string[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (key === 'signature' || value === undefined) continue;
    pairs.push(`${key}=${payfastEncode(value)}`);
  }
  const paramString = `${pairs.join('&')}&passphrase=${payfastEncode(passphrase)}`;
  return crypto.createHash('md5').update(paramString).digest('hex');
}

// The subscription-management API (cancel/pause/update/fetch) uses a THIRD
// signature rule, distinct from both the checkout and ITN rules above —
// confirmed against the official payfast-php-sdk's Auth::generateApiSignature
// and Request::sendApiRequest (lib/Auth.php, lib/Request.php): every header
// and body value sent is merged with the passphrase into ONE object, sorted
// ALPHABETICALLY BY KEY (passphrase included at its sorted position, not
// appended last the way the checkout/ITN rules do), then joined and hashed —
// no blank-skipping. Found live: the original implementation reused
// buildSignature (checkout's append-passphrase-last, no version field) and
// got a real 401 "Merchant authorization failed" from PayFast's sandbox.
function buildApiSignature(fields: Record<string, string>, passphrase: string): string {
  const withPassphrase: Record<string, string> = { ...fields, passphrase };
  const pairs = Object.keys(withPassphrase)
    .sort()
    .filter((key) => key !== 'signature')
    .map((key) => `${key}=${payfastEncode(withPassphrase[key])}`);
  return crypto.createHash('md5').update(pairs.join('&')).digest('hex');
}

// PayFast's Request::sendApiRequest builds this timestamp with PHP's
// date("Y-m-d\TH:i:sO") — an ISO 8601 timestamp WITH a timezone offset in
// +HHMM form (e.g. "+0200"), using the server's local timezone. The original
// implementation used `toISOString().slice(0, 19)`, which drops the offset
// entirely — not just cosmetically wrong, but a real contributor to the same
// live 401 (the signed string didn't match what PayFast's backend expected
// to parse). This VPS and this project's local dev machine are both SAST
// (+02:00, no DST in South Africa), matching typical PayFast integrations.
function payfastApiTimestamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const offsetMinutes = -now.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absMinutes = Math.abs(offsetMinutes);
  const offsetHours = pad(Math.floor(absMinutes / 60));
  const offsetMins = pad(absMinutes % 60);
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}` +
    `${sign}${offsetHours}${offsetMins}`
  );
}

// Constant-time comparison so a webhook signature check (which gates whether
// a subscription gets marked active) doesn't leak byte-by-byte timing
// information to an attacker probing the endpoint.
function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function createPayfastProvider(config: PayfastConfig): PaymentProvider {
  const baseUrl = config.live ? 'https://www.payfast.co.za' : 'https://sandbox.payfast.co.za';

  return {
    async createSubscriptionCheckout({ subscriptionId, plan, trialDays, returnUrl, webhookUrl }) {
      const billingDate = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);
      const fields: Record<string, string> = {
        merchant_id: config.merchantId,
        merchant_key: config.merchantKey,
        return_url: returnUrl,
        cancel_url: returnUrl,
        notify_url: webhookUrl,
        m_payment_id: `sub_${subscriptionId}`,
        // `amount` is what PayFast charges IMMEDIATELY at checkout for a
        // subscription_type=1 request — separate from `recurring_amount`
        // below, which only starts from `billing_date`. This tenant is on a
        // genuine free trial, so the initial charge must be zero; confirmed
        // via PayFast's own support article "Can a subscription be set up
        // with an initial zero amount 'payment'?" (support.payfast.help) —
        // a subscription CAN be created with a zero-amount initial payment
        // (used only to tokenize the card), while `recurring_amount` carries
        // the real price from then on and can never itself be zero. '0.00'
        // matches the same two-decimal formatting PayFast's own SDK applies
        // to every amount field (see CustomIntegration::createFormFields),
        // so it isn't treated as a blank/omitted value by either side.
        amount: '0.00',
        item_name: `Barkie subscription — ${plan.name}`,
        subscription_type: '1',
        billing_date: billingDate.toISOString().slice(0, 10),
        recurring_amount: plan.monthlyPrice,
        frequency: '3', // PayFast: 3 = monthly
        cycles: '0', // 0 = until cancelled
      };
      const signature = buildSignature(fields, config.passphrase);
      const query = new URLSearchParams({ ...fields, signature }).toString();
      return { redirectUrl: `${baseUrl}/eng/process?${query}` };
    },

    async verifyWebhookSignature(req: Request): Promise<boolean> {
      if (!req.body || typeof req.body !== 'object') return false;
      const body = req.body as Record<string, string>;
      const { signature, ...rest } = body;
      if (!signature) return false;
      if (!safeCompare(buildItnSignature(rest, config.passphrase), signature)) return false;

      // Defense-in-depth beyond the local signature check: confirm the
      // ITN is genuine by posting the exact received body back to
      // PayFast's own validation endpoint. This is required by the
      // approved design spec — the local signature alone shares its only
      // secret (the passphrase) with every outbound checkout URL this
      // adapter builds, so a leaked passphrase would otherwise be
      // sufficient to forge an activation on its own.
      const validateUrl = config.live
        ? 'https://www.payfast.co.za/eng/query/validate'
        : 'https://sandbox.payfast.co.za/eng/query/validate';
      const params = new URLSearchParams(body as Record<string, string>).toString();
      const res = await fetch(validateUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params,
      });
      const text = await res.text();
      return text.trim() === 'VALID';
    },

    parseWebhookEvent(req: Request): NormalizedSubscriptionEvent | null {
      if (!req.body || typeof req.body !== 'object') return null;
      const body = req.body as Record<string, string>;
      const providerSubscriptionId = body.token;
      if (!providerSubscriptionId) return null;
      // m_payment_id encodes the Subscription row's own id (see the
      // NormalizedSubscriptionEvent doc comment above) — strip the "sub_"
      // prefix checkout added to it.
      const subscriptionId = body.m_payment_id?.startsWith('sub_') ? body.m_payment_id.slice(4) : undefined;
      const base = { providerSubscriptionId, subscriptionId };
      if (body.payment_status === 'COMPLETE') {
        return { ...base, type: 'payment_succeeded' };
      }
      if (body.payment_status === 'FAILED') {
        return { ...base, type: 'payment_failed' };
      }
      if (body.payment_status === 'CANCELLED') {
        return { ...base, type: 'canceled' };
      }
      return null;
    },

    async cancelSubscription(providerSubscriptionId: string): Promise<void> {
      // PayFast's subscription-cancel API — a single host (api.payfast.co.za)
      // for both sandbox and live — sandbox mode is selected via the
      // ?testing=true query param, not a different host the way the
      // checkout redirect and ITN-validate endpoints are. The signature is
      // computed over ALL THREE headers sent (merchant-id, version,
      // timestamp) via buildApiSignature — confirmed live against PayFast's
      // sandbox on 2026-09-09 after the original merchant-id+timestamp-only,
      // append-passphrase-last version returned a real 401.
      const timestamp = payfastApiTimestamp();
      const version = 'v1';
      const signature = buildApiSignature({ 'merchant-id': config.merchantId, version, timestamp }, config.passphrase);
      const testingParam = config.live ? '' : '?testing=true';
      const res = await fetch(`https://api.payfast.co.za/subscriptions/${providerSubscriptionId}/cancel${testingParam}`, {
        method: 'PUT',
        headers: {
          'merchant-id': config.merchantId,
          version,
          timestamp,
          signature,
        },
      });
      if (!res.ok) {
        throw new Error(`PayFast cancelSubscription failed: ${res.status} ${await res.text()}`);
      }
    },
  };
}

export const payfastProvider = createPayfastProvider({
  merchantId: env.payfastMerchantId ?? '',
  merchantKey: env.payfastMerchantKey ?? '',
  passphrase: env.payfastPassphrase ?? '',
  live: env.paymentsLive,
});
