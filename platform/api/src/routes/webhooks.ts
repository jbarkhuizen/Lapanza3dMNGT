import { Router } from 'express';
import { prisma } from '../db/client.js';
import { mailer } from '../lib/mailer.js';
import { payfastProvider } from '../billing/payfastProvider.js';
import { paypalProvider } from '../billing/paypalProvider.js';
import type { PaymentProvider, NormalizedSubscriptionEvent } from '../billing/types.js';

export const webhooksRouter = Router();

// Purely additive notification side-effect for the three billing events
// below. Deliberately swallows every error itself (never throws) so it can
// never turn a currently-working webhook into a 500 — this function's real
// job is to keep the payment provider's webhook contract intact (a fast 200
// response), regardless of what happens here. Per the design spec's scope
// decision, billing categories have no separate *Email opt-out column: the
// single *InApp preference flag gates both the Notification row and the
// (always-sent-when-enabled) email in one go.
async function notifyBillingEvent(params: {
  tenantId: string;
  type: 'payment_received' | 'payment_failed' | 'subscription_cancelled';
  message: string;
  inAppField: 'paymentReceiptInApp' | 'paymentFailedInApp' | 'subscriptionCancelledInApp';
}): Promise<void> {
  try {
    const preference = await prisma.notificationPreference.upsert({
      where: { tenantId: params.tenantId },
      create: { tenantId: params.tenantId },
      update: {},
    });
    if (!preference[params.inAppField]) return;

    await prisma.notification.create({
      data: { tenantId: params.tenantId, type: params.type, message: params.message },
    });
    if (mailer.isConfigured()) {
      const tenant = await prisma.tenant.findUnique({ where: { id: params.tenantId }, select: { email: true } });
      if (tenant) {
        await mailer.sendMail({ to: tenant.email, subject: 'Barkie notification', text: params.message });
      }
    }
  } catch (err) {
    console.error('billing notification failed', err);
  }
}

async function applyEvent(event: NormalizedSubscriptionEvent, providerName: string): Promise<void> {
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

  // Defense in depth: the resolved row must actually belong to the
  // provider whose endpoint received this event — e.g. an id collision
  // across providers, or an event simply misrouted to the wrong endpoint.
  // Drop it before any binding/mutation rather than trusting the lookup
  // alone.
  if (subscription.paymentProvider !== providerName) return;

  // Defense in depth for the rare case PayFast ever reissued a token for
  // the same subscription: if the row is already bound to a
  // providerSubscriptionId and this event names a different one, ignore
  // it rather than overwriting the currently-bound token.
  if (subscription.providerSubscriptionId && subscription.providerSubscriptionId !== event.providerSubscriptionId) {
    return;
  }
  // A 'canceled' row reflects a deliberate tenant action (POST
  // /api/billing/cancel), regardless of whether providerSubscriptionId is
  // still bound — the normal cancel flow leaves the token in place, it
  // only flips status. So a canceled row is NOT limited to the
  // first-contact case: a delayed 'activated'/'payment_succeeded' ITN for
  // an in-flight charge that was already processing when the tenant
  // clicked cancel would otherwise pass the token-match guard above (same
  // subscription, same token) and silently resurrect access. Block every
  // event type except 'canceled' itself — status stays 'canceled' either
  // way, though the update below still binds providerIdPatch as a side
  // effect if the row wasn't already bound (harmless: same value the
  // token-match guard above would otherwise gate on). This is intentionally
  // narrower than 'lapsed': a lapsed row self-healed locally because the
  // provider never told us anything, so it legitimately needs to accept
  // its real first-contact ITN (see the token-match guard above) — that
  // must keep working and this check does not touch it.
  if (subscription.status === 'canceled' && event.type !== 'canceled') {
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
    await notifyBillingEvent({
      tenantId: subscription.tenantId,
      type: 'payment_received',
      message: 'Your payment was received. Thank you!',
      inAppField: 'paymentReceiptInApp',
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
    await notifyBillingEvent({
      tenantId: subscription.tenantId,
      type: 'payment_failed',
      message: 'Your last payment failed. Please update your payment method to keep your subscription active.',
      inAppField: 'paymentFailedInApp',
    });
  } else if (event.type === 'canceled') {
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: 'canceled', ...providerIdPatch },
    });
    await notifyBillingEvent({
      tenantId: subscription.tenantId,
      type: 'subscription_cancelled',
      message: 'Your subscription has been cancelled.',
      inAppField: 'subscriptionCancelledInApp',
    });
  }
}

function makeWebhookHandler(provider: PaymentProvider, providerName: string) {
  return async (req: import('express').Request, res: import('express').Response) => {
    const validSignature = await Promise.resolve(provider.verifyWebhookSignature(req));
    if (!validSignature) {
      return res.status(400).json({ ok: false, error: 'Invalid webhook signature.' });
    }
    const event = provider.parseWebhookEvent(req);
    if (event) {
      await applyEvent(event, providerName);
    }
    res.json({ ok: true });
  };
}

// These names match the lowercase provider keys used throughout billing.ts's
// `providers` record and persisted verbatim as Subscription.paymentProvider.
webhooksRouter.post('/api/webhooks/payfast', makeWebhookHandler(payfastProvider, 'payfast'));
webhooksRouter.post('/api/webhooks/paypal', makeWebhookHandler(paypalProvider, 'paypal'));
