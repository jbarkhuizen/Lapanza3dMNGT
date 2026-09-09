import { Router } from 'express';
import { prisma } from '../db/client.js';
import { payfastProvider } from '../billing/payfastProvider.js';
import { paypalProvider } from '../billing/paypalProvider.js';
import type { PaymentProvider, NormalizedSubscriptionEvent } from '../billing/payfastProvider.js';

export const webhooksRouter = Router();

const GRACE_PERIOD_DAYS = 7;

async function applyEvent(event: NormalizedSubscriptionEvent): Promise<void> {
  if (!event.providerSubscriptionId) return;

  // PayFast's first-ever event for a subscription can't be found by
  // providerSubscriptionId (nothing was persisted at checkout time,
  // since PayFast has no synchronous "create" call) — resolve by the
  // Subscription row's own id instead, which checkout pre-generated and
  // embedded in m_payment_id before ever calling PayFast (see
  // billing.ts). Because a resubscribe deletes the old row and creates an
  // entirely new one with a fresh id, a stale/delayed ITN carrying the
  // old id simply finds no row — findUnique returns null and the event is
  // silently dropped below. This resolves the whole stale-event problem
  // structurally, with no heuristic needed. PayPal always has
  // providerSubscriptionId persisted already (captured synchronously at
  // checkout), so event.subscriptionId stays undefined for it and this
  // branch is skipped.
  const subscription = event.subscriptionId
    ? await prisma.subscription.findUnique({ where: { id: event.subscriptionId } })
    : await prisma.subscription.findFirst({ where: { providerSubscriptionId: event.providerSubscriptionId } });
  if (!subscription) return;

  // Defense in depth for the rare case PayFast ever reissued a token for
  // the same subscription: if the row is already bound to a
  // providerSubscriptionId and this event names a different one, ignore
  // it rather than overwriting the currently-bound token.
  if (subscription.providerSubscriptionId && subscription.providerSubscriptionId !== event.providerSubscriptionId) {
    return;
  }
  // First contact (no providerSubscriptionId bound yet) binding onto this
  // row is now scoped to this exact row's id, not shared across every
  // resubscribe attempt a tenant has ever made — so a legitimately-paid
  // subscription that self-healed to 'lapsed' while awaiting its first
  // ITN (e.g. the charge clears a little after the grace-period slack
  // runs out) must still be able to bind and reactivate. Only a
  // 'canceled' row — a deliberate tenant action — refuses to be
  // resurrected by a late positive event.
  if (!subscription.providerSubscriptionId && subscription.status === 'canceled') {
    return;
  }

  // First contact for a PayFast subscription — persist the real token
  // now that we have it, so subsequent lookups (and a future cancel
  // call) can use providerSubscriptionId like PayPal's always could.
  const providerIdPatch = subscription.providerSubscriptionId ? {} : { providerSubscriptionId: event.providerSubscriptionId };

  if (event.type === 'activated' || event.type === 'payment_succeeded') {
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: 'active',
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        pastDueSince: null,
        ...providerIdPatch,
      },
    });
  } else if (event.type === 'payment_failed') {
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: 'past_due',
        // Only stamp pastDueSince on the FIRST failure — a provider's own
        // automatic retries of a still-failing charge send another
        // payment_failed event days later, and re-stamping this on every
        // retry would reset the grace-period clock indefinitely (the
        // exact bug the final whole-branch review flagged). Anchor on the
        // field itself, not on status === 'past_due': once the grace
        // window lapses, requireActiveSubscription self-heals status to
        // 'lapsed' (not 'past_due'), and a status-based check would see
        // that as "first failure" and re-stamp pastDueSince on every
        // subsequent dunning retry, resetting the grace window forever.
        // ?? only re-stamps when pastDueSince is genuinely null — first
        // failure ever, or after a clean recovery (the 'active' branch
        // above explicitly clears it back to null).
        pastDueSince: subscription.pastDueSince ?? new Date(),
        ...providerIdPatch,
      },
    });
  } else if (event.type === 'canceled') {
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: 'canceled', ...providerIdPatch },
    });
  }
}

function makeWebhookHandler(provider: PaymentProvider) {
  return async (req: import('express').Request, res: import('express').Response) => {
    const validSignature = await Promise.resolve(provider.verifyWebhookSignature(req));
    if (!validSignature) {
      return res.status(400).json({ ok: false, error: 'Invalid webhook signature.' });
    }
    const event = provider.parseWebhookEvent(req);
    if (event) {
      await applyEvent(event);
    }
    res.json({ ok: true });
  };
}

webhooksRouter.post('/api/webhooks/payfast', makeWebhookHandler(payfastProvider));
webhooksRouter.post('/api/webhooks/paypal', makeWebhookHandler(paypalProvider));
