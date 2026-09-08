import crypto from 'node:crypto';
import type { Request } from 'express';

export interface PaymentProvider {
  createSubscriptionCheckout(params: {
    tenantId: string;
    plan: { id: string; name: string; monthlyPrice: string };
    trialDays: number;
    returnUrl: string;
    webhookUrl: string;
  }): Promise<{ redirectUrl: string }>;
  verifyWebhookSignature(req: Request): boolean;
  parseWebhookEvent(req: Request): NormalizedSubscriptionEvent | null;
}

export interface NormalizedSubscriptionEvent {
  providerSubscriptionId: string;
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
      const body = req.body as Record<string, string>;
      const { signature, ...rest } = body;
      if (!signature) return false;
      return buildSignature(rest, config.passphrase) === signature;
    },

    parseWebhookEvent(req: Request): NormalizedSubscriptionEvent | null {
      const body = req.body as Record<string, string>;
      const providerSubscriptionId = body.token;
      if (!providerSubscriptionId) return null;
      if (body.payment_status === 'COMPLETE') {
        return { providerSubscriptionId, type: 'payment_succeeded' };
      }
      if (body.payment_status === 'FAILED') {
        return { providerSubscriptionId, type: 'payment_failed' };
      }
      if (body.payment_status === 'CANCELLED') {
        return { providerSubscriptionId, type: 'canceled' };
      }
      return null;
    },
  };
}

export const payfastProvider = createPayfastProvider({
  merchantId: process.env.PAYFAST_MERCHANT_ID ?? '',
  merchantKey: process.env.PAYFAST_MERCHANT_KEY ?? '',
  passphrase: process.env.PAYFAST_PASSPHRASE ?? '',
  live: process.env.NODE_ENV === 'production',
});
