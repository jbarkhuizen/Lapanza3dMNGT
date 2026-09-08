import { Router } from 'express';
import { z } from 'zod';
import { requireTenantAuth } from '../middleware/requireTenantAuth.js';
import { tenantScope } from '../db/scoped.js';
import { prisma } from '../db/client.js';
import { env } from '../env.js';
import { payfastProvider } from '../billing/payfastProvider.js';
import { paypalProvider } from '../billing/paypalProvider.js';
import type { PaymentProvider } from '../billing/payfastProvider.js';

export const billingRouter = Router();
billingRouter.use(requireTenantAuth);

const TRIAL_DAYS = 14;

const providers: Record<string, PaymentProvider> = {
  payfast: payfastProvider,
  paypal: paypalProvider,
};

function serializePlan(plan: { id: string; name: string; monthlyPrice: unknown; sortOrder: number }) {
  return {
    id: plan.id,
    name: plan.name,
    monthlyPrice: (plan.monthlyPrice as { toFixed: (n: number) => string }).toFixed(2),
    sortOrder: plan.sortOrder,
  };
}

function serializeSubscription(
  subscription: {
    id: string;
    status: string;
    paymentProvider: string;
    trialEndsAt: Date;
    currentPeriodEnd: Date | null;
    plan: { id: string; name: string; monthlyPrice: unknown; sortOrder: number };
  } | null,
) {
  if (!subscription) return null;
  return {
    id: subscription.id,
    status: subscription.status,
    paymentProvider: subscription.paymentProvider,
    trialEndsAt: subscription.trialEndsAt,
    currentPeriodEnd: subscription.currentPeriodEnd,
    plan: serializePlan(subscription.plan),
  };
}

billingRouter.get('/api/plans', async (_req, res) => {
  const plans = await prisma.plan.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } });
  res.json({ ok: true, plans: plans.map(serializePlan) });
});

billingRouter.get('/api/billing/subscription', async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const subscription = await scoped.subscription.get();
  res.json({ ok: true, subscription: serializeSubscription(subscription) });
});

const checkoutSchema = z.object({
  planId: z.string().min(1),
  provider: z.enum(['payfast', 'paypal']),
});

billingRouter.post('/api/billing/checkout', async (req, res) => {
  const parsed = checkoutSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: 'A plan and a payment provider are required.' });
  }
  const { planId, provider: providerName } = parsed.data;

  const plan = await prisma.plan.findFirst({ where: { id: planId, active: true } });
  if (!plan) {
    return res.status(400).json({ ok: false, error: 'That plan is not available.' });
  }

  const scoped = tenantScope(req.tenantId!);
  const existing = await scoped.subscription.get();
  if (existing) {
    return res.status(400).json({ ok: false, error: 'You already have a subscription.' });
  }

  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  await scoped.subscription.create({
    planId: plan.id,
    status: 'trialing',
    paymentProvider: providerName,
    trialEndsAt,
  });

  const provider = providers[providerName];
  const { redirectUrl } = await provider.createSubscriptionCheckout({
    tenantId: req.tenantId!,
    plan: { id: plan.id, name: plan.name, monthlyPrice: plan.monthlyPrice.toFixed(2) },
    trialDays: TRIAL_DAYS,
    returnUrl: `${env.frontendOrigin}${env.frontendBasePath}/billing/complete`,
    webhookUrl: `${env.frontendOrigin}/api/webhooks/${providerName}`,
  });

  res.json({ ok: true, redirectUrl });
});

billingRouter.post('/api/billing/cancel', async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const subscription = await scoped.subscription.get();
  if (!subscription) {
    return res.status(400).json({ ok: false, error: 'No subscription to cancel.' });
  }
  await scoped.subscription.updateStatus('canceled');
  res.json({ ok: true });
});
