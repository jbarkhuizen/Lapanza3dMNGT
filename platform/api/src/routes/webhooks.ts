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
  // tenantId the adapter parsed from the payload instead. PayPal always
  // has providerSubscriptionId persisted already (captured synchronously
  // at checkout), so event.tenantId stays undefined for it and this
  // branch is skipped.
  const subscription = event.tenantId
    ? await prisma.subscription.findUnique({ where: { tenantId: event.tenantId } })
    : await prisma.subscription.findFirst({ where: { providerSubscriptionId: event.providerSubscriptionId } });
  if (!subscription) return;

  // Guard against a stale/delayed event mutating the wrong subscription
  // after a tenant has resubscribed (old row deleted, new row created).
  // PayFast ITNs ALWAYS carry tenantId (not just on first contact), so
  // every PayFast event for this tenant resolves to whatever row
  // currently exists — including a brand-new one that has nothing to do
  // with the event's own (dead) provider subscription. If the row is
  // already bound to a providerSubscriptionId and this event names a
  // different one, it belongs to a subscription that no longer exists
  // locally — ignore it rather than corrupting the current one.
  if (subscription.providerSubscriptionId && subscription.providerSubscriptionId !== event.providerSubscriptionId) {
    return;
  }
  // First contact (no providerSubscriptionId bound yet) should only ever
  // bind onto a row that's still alive — a canceled/lapsed row receiving
  // its first-ever providerSubscriptionId binding means a stale ITN
  // (e.g. that dead subscription's own final COMPLETE/CANCELLED
  // notification) is trying to resurrect it after the tenant moved on.
  if (!subscription.providerSubscriptionId && subscription.status !== 'trialing' && subscription.status !== 'active') {
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
