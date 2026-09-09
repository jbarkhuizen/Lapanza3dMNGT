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
        // exact bug the final whole-branch review flagged).
        pastDueSince: subscription.status === 'past_due' ? subscription.pastDueSince : new Date(),
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
