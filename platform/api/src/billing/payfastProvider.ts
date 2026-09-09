import crypto from 'node:crypto';
import type { Request } from 'express';
import { env } from '../env.js';

export interface PaymentProvider {
  createSubscriptionCheckout(params: {
    tenantId: string;
    plan: { id: string; name: string; monthlyPrice: string };
    trialDays: number;
    returnUrl: string;
    webhookUrl: string;
  }): Promise<{ redirectUrl: string; providerSubscriptionId?: string }>;
  verifyWebhookSignature(req: Request): boolean | Promise<boolean>;
  parseWebhookEvent(req: Request): NormalizedSubscriptionEvent | null;
  cancelSubscription(providerSubscriptionId: string): Promise<void>;
}

export interface NormalizedSubscriptionEvent {
  providerSubscriptionId: string;
  // Only PayFast sets this (parsed from m_payment_id, which it always
  // echoes back) — PayFast has no synchronous "create" API call, so no
  // providerSubscriptionId is known until the first webhook arrives, and
  // resolving the tenant by ID alone doesn't work for that first event.
  // PayPal's checkout DOES return a real subscription id synchronously
  // (captured at checkout time, Step 6 below), so its events resolve via
  // providerSubscriptionId alone and this stays undefined.
  tenantId?: string;
  type: 'activated' | 'payment_succeeded' | 'payment_failed' | 'canceled';
}

interface PayfastConfig {
  merchantId: string;
  merchantKey: string;
  passphrase: string;
  live: boolean;
}

// PayFast requires values URL-encoded with spaces as "+" (application/x-www-form-urlencoded
// style), not "%20" — encodeURIComponent alone produces "%20", so this
// normalizes it the way PayFast's own signature examples do.
function payfastEncode(value: string): string {
  return encodeURIComponent(value).replace(/%20/g, '+');
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
    async createSubscriptionCheckout({ tenantId, plan, trialDays, returnUrl, webhookUrl }) {
      const billingDate = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);
      const fields: Record<string, string> = {
        merchant_id: config.merchantId,
        merchant_key: config.merchantKey,
        return_url: returnUrl,
        cancel_url: returnUrl,
        notify_url: webhookUrl,
        m_payment_id: `sub_${tenantId}`,
        amount: plan.monthlyPrice,
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

    verifyWebhookSignature(req: Request): boolean {
      if (!req.body || typeof req.body !== 'object') return false;
      const body = req.body as Record<string, string>;
      const { signature, ...rest } = body;
      if (!signature) return false;
      return safeCompare(buildSignature(rest, config.passphrase), signature);
    },

    parseWebhookEvent(req: Request): NormalizedSubscriptionEvent | null {
      if (!req.body || typeof req.body !== 'object') return null;
      const body = req.body as Record<string, string>;
      const providerSubscriptionId = body.token;
      if (!providerSubscriptionId) return null;
      const tenantId = body.m_payment_id?.startsWith('sub_') ? body.m_payment_id.slice(4) : undefined;
      const base = { providerSubscriptionId, tenantId };
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
      // PayFast's subscription-cancel API — distinct from the checkout
      // signature scheme above (this one signs merchant-id + timestamp,
      // not the request body), and it's a single host (api.payfast.co.za)
      // for both sandbox and live — sandbox mode is selected via the
      // ?testing=true query param, not a different host the way the
      // checkout redirect and ITN-validate endpoints are. Header names
      // and the exact signed-field set are per PayFast's published API
      // docs as of this plan's writing; like the ITN field names in
      // Task 2, this needs one live sandbox call to confirm before real
      // money is involved (see this plan's "After all tasks" section).
      const timestamp = new Date().toISOString().slice(0, 19);
      const signature = buildSignature({ 'merchant-id': config.merchantId, timestamp }, config.passphrase);
      const testingParam = config.live ? '' : '?testing=true';
      const res = await fetch(`https://api.payfast.co.za/subscriptions/${providerSubscriptionId}/cancel${testingParam}`, {
        method: 'PUT',
        headers: {
          'merchant-id': config.merchantId,
          version: 'v1',
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
