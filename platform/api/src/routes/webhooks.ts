import { Router } from 'express';
import { prisma } from '../db/client.js';
import { payfastProvider } from '../billing/payfastProvider.js';
import { paypalProvider } from '../billing/paypalProvider.js';
import type { PaymentProvider, NormalizedSubscriptionEvent } from '../billing/payfastProvider.js';

export const webhooksRouter = Router();

const GRACE_PERIOD_DAYS = 7;

async function applyEvent(event: NormalizedSubscriptionEvent): Promise<void> {
  if (!event.providerSubscriptionId) return;

  const subscription = await prisma.subscription.findFirst({
    where: { providerSubscriptionId: event.providerSubscriptionId },
  });
  if (!subscription) return;

  if (event.type === 'activated' || event.type === 'payment_succeeded') {
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: 'active', currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
    });
  } else if (event.type === 'payment_failed') {
    await prisma.subscription.update({ where: { id: subscription.id }, data: { status: 'past_due' } });
  } else if (event.type === 'canceled') {
    await prisma.subscription.update({ where: { id: subscription.id }, data: { status: 'canceled' } });
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
