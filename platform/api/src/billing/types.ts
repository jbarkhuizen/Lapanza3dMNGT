import type { Request } from 'express';

export interface PaymentProvider {
  createSubscriptionCheckout(params: {
    tenantId: string;
    subscriptionId: string;
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
  // echoes back). As of the id-scoped correlation fix, m_payment_id is set
  // once at checkout time to the pre-generated Subscription row's own
  // primary-key id — NOT the tenant id — so it uniquely identifies this
  // exact row rather than "whatever subscription this tenant currently
  // has". PayFast has no synchronous "create" API call, so no
  // providerSubscriptionId is known until the first webhook arrives, and
  // that first event has to resolve some other way — hence this field.
  // Because a resubscribe deletes the old row and creates a brand-new one
  // with a fresh id, a stale/delayed ITN carrying the old row's id simply
  // finds nothing on lookup and is dropped, with no heuristic needed.
  // PayPal's checkout DOES return a real subscription id synchronously
  // (captured at checkout time, Step 6 below), so its events resolve via
  // providerSubscriptionId alone and this stays undefined.
  subscriptionId?: string;
  type: 'activated' | 'payment_succeeded' | 'payment_failed' | 'canceled';
}
