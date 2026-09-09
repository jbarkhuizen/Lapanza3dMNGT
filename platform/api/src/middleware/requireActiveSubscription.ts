import type { Request, Response, NextFunction } from 'express';
import { tenantScope } from '../db/scoped.js';

const GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;
// A little slack past the exact trialEndsAt instant so a webhook that's
// running slightly behind (network latency, provider processing delay)
// doesn't lock out a tenant whose card was actually charged successfully
// moments before this check runs.
const TRIAL_EXPIRY_SLACK_MS = 24 * 60 * 60 * 1000;

export async function requireActiveSubscription(req: Request, res: Response, next: NextFunction) {
  if (req.method === 'GET') {
    return next();
  }

  const scoped = tenantScope(req.tenantId!);
  const subscription = await scoped.subscription.get();

  if (!subscription) {
    return res.status(402).json({ ok: false, error: 'Start a subscription to continue.' });
  }

  if (subscription.status === 'active') {
    return next();
  }

  if (subscription.status === 'trialing') {
    const trialExpired = Date.now() - subscription.trialEndsAt.getTime() > TRIAL_EXPIRY_SLACK_MS;
    if (!trialExpired) {
      return next();
    }
    // The trial ran out with no successful charge ever recorded (no
    // webhook moved this to 'active') — self-heal the status the same
    // way expired sessions self-prune elsewhere in this codebase, so a
    // second request against this tenant doesn't re-derive the same
    // conclusion from scratch.
    await scoped.subscription.updateStatus('lapsed').catch(() => {});
    return res.status(402).json({ ok: false, error: 'Your free trial has ended. Complete payment setup to continue.' });
  }

  if (subscription.status === 'past_due') {
    const withinGrace = subscription.pastDueSince
      ? Date.now() - subscription.pastDueSince.getTime() < GRACE_PERIOD_MS
      : true; // no pastDueSince recorded yet (shouldn't normally happen) — err permissive, not punitive
    if (withinGrace) {
      return next();
    }
    await scoped.subscription.updateStatus('lapsed').catch(() => {});
  }

  return res.status(402).json({ ok: false, error: 'Your subscription has lapsed. Update your payment method to continue.' });
}
