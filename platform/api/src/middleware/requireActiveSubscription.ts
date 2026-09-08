import type { Request, Response, NextFunction } from 'express';
import { tenantScope } from '../db/scoped.js';

const GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;

export async function requireActiveSubscription(req: Request, res: Response, next: NextFunction) {
  if (req.method === 'GET') {
    return next();
  }

  const scoped = tenantScope(req.tenantId!);
  const subscription = await scoped.subscription.get();

  if (!subscription) {
    return res.status(402).json({ ok: false, error: 'Start a subscription to continue.' });
  }

  if (subscription.status === 'trialing' || subscription.status === 'active') {
    return next();
  }

  if (subscription.status === 'past_due') {
    const withinGrace = Date.now() - subscription.updatedAt.getTime() < GRACE_PERIOD_MS;
    if (withinGrace) {
      return next();
    }
  }

  return res.status(402).json({ ok: false, error: 'Your subscription has lapsed. Update your payment method to continue.' });
}
