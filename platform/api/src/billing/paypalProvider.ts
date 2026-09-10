import type { Request } from 'express';
import type { PaymentProvider, NormalizedSubscriptionEvent } from './types.js';
import { env } from '../env.js';

interface PaypalConfig {
  clientId: string;
  clientSecret: string;
  webhookId: string;
  live: boolean;
}

export function createPaypalProvider(
  config: PaypalConfig,
  fetchImpl: typeof fetch = fetch,
): PaymentProvider {
  const baseUrl = config.live ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';

  async function getAccessToken(): Promise<string> {
    const res = await fetchImpl(`${baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    if (!res.ok) {
      throw new Error(`PayPal getAccessToken failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    return data.access_token;
  }

  return {
    async createSubscriptionCheckout({ tenantId, plan, trialDays, returnUrl, webhookUrl }) {
      const accessToken = await getAccessToken();
      const authHeaders = {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      };

      const productRes = await fetchImpl(`${baseUrl}/v1/catalogs/products`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          name: `Barkie — ${plan.name}`,
          type: 'SERVICE',
          category: 'SOFTWARE',
        }),
      });
      if (!productRes.ok) {
        throw new Error(`PayPal create product failed: ${productRes.status} ${await productRes.text()}`);
      }
      const product = await productRes.json();

      const planRes = await fetchImpl(`${baseUrl}/v1/billing/plans`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          product_id: product.id,
          name: `Barkie — ${plan.name}`,
          billing_cycles: [
            {
              tenure_type: 'TRIAL',
              sequence: 1,
              total_cycles: 1,
              frequency: { interval_unit: 'DAY', interval_count: trialDays },
              pricing_scheme: { fixed_price: { value: '0', currency_code: 'ZAR' } },
            },
            {
              tenure_type: 'REGULAR',
              sequence: 2,
              total_cycles: 0,
              frequency: { interval_unit: 'MONTH', interval_count: 1 },
              pricing_scheme: { fixed_price: { value: plan.monthlyPrice, currency_code: 'ZAR' } },
            },
          ],
          payment_preferences: { auto_bill_outstanding: true },
        }),
      });
      if (!planRes.ok) {
        throw new Error(`PayPal create plan failed: ${planRes.status} ${await planRes.text()}`);
      }
      const paypalPlan = await planRes.json();

      const subscriptionRes = await fetchImpl(`${baseUrl}/v1/billing/subscriptions`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          plan_id: paypalPlan.id,
          custom_id: tenantId,
          application_context: {
            return_url: returnUrl,
            cancel_url: returnUrl,
          },
        }),
      });
      if (!subscriptionRes.ok) {
        throw new Error(`PayPal create subscription failed: ${subscriptionRes.status} ${await subscriptionRes.text()}`);
      }
      const subscription = await subscriptionRes.json();
      const approveLink = subscription.links.find((link: { rel: string; href: string }) => link.rel === 'approve');
      if (!approveLink) {
        throw new Error('PayPal subscription response had no approve link');
      }
      if (typeof subscription.id !== 'string' || subscription.id.length === 0) {
        throw new Error('PayPal subscription response had no id');
      }

      return { redirectUrl: approveLink.href, providerSubscriptionId: subscription.id };
    },

    async verifyWebhookSignature(req: Request): Promise<boolean> {
      const accessToken = await getAccessToken();
      const res = await fetchImpl(`${baseUrl}/v1/notifications/verify-webhook-signature`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transmission_id: req.headers['paypal-transmission-id'],
          transmission_time: req.headers['paypal-transmission-time'],
          cert_url: req.headers['paypal-cert-url'],
          auth_algo: req.headers['paypal-auth-algo'],
          transmission_sig: req.headers['paypal-transmission-sig'],
          webhook_id: config.webhookId,
          webhook_event: req.body,
        }),
      });
      const data = await res.json();
      return data.verification_status === 'SUCCESS';
    },

    parseWebhookEvent(req: Request): NormalizedSubscriptionEvent | null {
      if (!req.body || typeof req.body !== 'object') return null;
      const body = req.body as { event_type: string; resource: Record<string, unknown> };
      const providerSubscriptionId =
        (body.resource?.billing_agreement_id as string | undefined) ??
        (body.resource?.id as string | undefined);
      if (!providerSubscriptionId) return null;

      switch (body.event_type) {
        case 'BILLING.SUBSCRIPTION.ACTIVATED':
          return { providerSubscriptionId, type: 'activated' };
        case 'PAYMENT.SALE.COMPLETED':
          return { providerSubscriptionId, type: 'payment_succeeded' };
        case 'PAYMENT.SALE.DENIED':
        case 'BILLING.SUBSCRIPTION.PAYMENT.FAILED':
          return { providerSubscriptionId, type: 'payment_failed' };
        case 'BILLING.SUBSCRIPTION.CANCELLED':
          return { providerSubscriptionId, type: 'canceled' };
        default:
          return null;
      }
    },

    async cancelSubscription(providerSubscriptionId: string): Promise<void> {
      const accessToken = await getAccessToken();
      const res = await fetchImpl(`${baseUrl}/v1/billing/subscriptions/${providerSubscriptionId}/cancel`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason: 'Canceled by tenant' }),
      });
      if (!res.ok && res.status !== 204) {
        throw new Error(`PayPal cancelSubscription failed: ${res.status} ${await res.text()}`);
      }
    },
  };
}

export const paypalProvider = createPaypalProvider({
  clientId: env.paypalClientId ?? '',
  clientSecret: env.paypalClientSecret ?? '',
  webhookId: env.paypalWebhookId ?? '',
  live: env.paymentsLive,
});
