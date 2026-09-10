import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { requireTenantAuth } from '../middleware/requireTenantAuth.js';
import { tenantScope } from '../db/scoped.js';
import { prisma } from '../db/client.js';
import { env } from '../env.js';
import { payfastProvider } from '../billing/payfastProvider.js';
import { paypalProvider } from '../billing/paypalProvider.js';
import type { PaymentProvider } from '../billing/types.js';

export const billingRouter = Router();
billingRouter.use(requireTenantAuth);

const TRIAL_DAYS = 14;

export const providers: Record<string, PaymentProvider> = {
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
  // 'past_due' must also be allowed to resubscribe — the banner and 402
  // error copy both promise a way to fix a failing subscription, and this
  // is the only path that exists to do it (there's no separate
  // payment-method-update flow). A past_due row normally still has a real
  // providerSubscriptionId bound (that's how it got to past_due in the
  // first place — a genuine payment_failed webhook, which only ever fires
  // after first contact), so the best-effort cancel-before-delete logic
  // below still applies to it exactly like it does for canceled/lapsed.
  if (existing && existing.status !== 'canceled' && existing.status !== 'lapsed' && existing.status !== 'past_due') {
    return res.status(400).json({ ok: false, error: 'You already have a subscription.' });
  }

  // Call the provider FIRST, before writing anything — if this throws
  // (bad credentials, network issue, provider outage), no orphan
  // subscription row is left behind blocking every future checkout
  // attempt via the "already have a subscription" check above.
  const provider = providers[providerName];
  // Generated BEFORE the provider call and used as the row's own primary
  // key below, so the id PayFast echoes back on every ITN (via
  // m_payment_id) names this exact row, not the tenant. A resubscribe
  // deletes this row and creates a new one with a fresh id, so a stale ITN
  // carrying this id can never resolve to whatever row exists later.
  const subscriptionId = randomUUID();
  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  const { redirectUrl, providerSubscriptionId } = await provider.createSubscriptionCheckout({
    tenantId: req.tenantId!,
    subscriptionId,
    plan: { id: plan.id, name: plan.name, monthlyPrice: plan.monthlyPrice.toFixed(2) },
    trialDays: TRIAL_DAYS,
    returnUrl: `${env.frontendOrigin}${env.frontendBasePath}/billing/complete`,
    webhookUrl: `${env.frontendOrigin}/api/webhooks/${providerName}`,
  });

  if (existing) {
    // A previously canceled/lapsed subscription is a dead row — this is
    // a genuinely new subscription attempt, not an update to the old one.
    // A 'lapsed' row was self-healed locally by requireActiveSubscription,
    // which only ever updates local status and never calls the provider —
    // so it may still have a live providerSubscriptionId. Deleting the row
    // without telling the provider to stop would lose the only record of
    // that id, leaving the tenant paying for two subscriptions forever.
    // Best-effort: for an already-canceled row this call is likely
    // redundant, but harmless, and a failure (e.g. 404 because it's
    // already dead provider-side) must not block the resubscribe.
    if (existing.providerSubscriptionId) {
      const oldProvider = providers[existing.paymentProvider];
      if (!oldProvider) {
        // Should be unreachable: providerSubscriptionId is only ever set by
        // a genuine payfast/paypal checkout (see providers above), so any
        // row that reaches here with one set has a real paymentProvider.
        // Fail loudly rather than let an unrecognized value throw past the
        // .catch() below — that .catch() only swallows a failed *cancel
        // call*, not a TypeError from indexing `providers` with a bad key,
        // so without this guard a bad value here would turn this
        // "never blocks the resubscribe" best-effort path into an
        // unhandled 500. Same contract as admin.ts's grant/cancel routes.
        return res.status(500).json({ ok: false, error: 'Unrecognized payment provider on this subscription.' });
      }
      await oldProvider.cancelSubscription(existing.providerSubscriptionId).catch((error) => {
        console.error(
          `Failed to cancel previous ${existing.paymentProvider} subscription ${existing.providerSubscriptionId} during resubscribe:`,
          error,
        );
      });
    }
    // The best-effort provider cancel above is an external network call and
    // stays outside this transaction — its .catch() swallow must not
    // change. But the delete-then-create pair that replaces the local row
    // IS purely local DB work, so it's wrapped in a single transaction: a
    // failure between the two (e.g. the create violating a constraint)
    // must not leave the tenant with zero subscription rows, permanently
    // stuck on the "no subscription" 402 with no way back in.
    await prisma.$transaction([
      prisma.subscription.deleteMany({ where: { tenantId: req.tenantId! } }),
      prisma.subscription.create({
        data: {
          id: subscriptionId,
          tenantId: req.tenantId!,
          planId: plan.id,
          status: 'trialing',
          paymentProvider: providerName,
          trialEndsAt,
          providerSubscriptionId,
        },
      }),
    ]);
  } else {
    await scoped.subscription.create({
      id: subscriptionId,
      planId: plan.id,
      status: 'trialing',
      paymentProvider: providerName,
      trialEndsAt,
      providerSubscriptionId,
    });
  }

  res.json({ ok: true, redirectUrl });
});

billingRouter.post('/api/billing/cancel', async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const subscription = await scoped.subscription.get();
  if (!subscription) {
    return res.status(400).json({ ok: false, error: 'No subscription to cancel.' });
  }
  if (!subscription.providerSubscriptionId) {
    // No provider-side subscription was ever confirmed (e.g. a PayFast
    // trial where the first ITN hasn't landed yet) — nothing to cancel
    // there, just cancel locally.
    await scoped.subscription.updateStatus('canceled');
    return res.json({ ok: true });
  }
  const provider = providers[subscription.paymentProvider];
  await provider.cancelSubscription(subscription.providerSubscriptionId);
  await scoped.subscription.updateStatus('canceled');
  res.json({ ok: true });
});
