import type { Request, Response, NextFunction, ParamsDictionary } from 'express-serve-static-core';
import type { ParsedQs } from 'qs';
import { tenantScope } from '../db/scoped.js';

const GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;
// A little slack past the exact trialEndsAt instant so a webhook that's
// running slightly behind (network latency, provider processing delay)
// doesn't lock out a tenant whose card was actually charged successfully
// moments before this check runs.
const TRIAL_EXPIRY_SLACK_MS = 24 * 60 * 60 * 1000;

// Kept as a genuinely generic function — see requireTenantAuth.ts for why
// (keeps a route's own inferred `:param` types, e.g. `req.params.id`,
// intact when this is passed alongside the route's handler to the same
// router call).
export async function requireActiveSubscription<P = ParamsDictionary>(
  req: Request<P, unknown, unknown, ParsedQs, Record<string, unknown>>,
  res: Response<unknown, Record<string, unknown>>,
  next: NextFunction,
) {
  if (req.method === 'GET') {
    return next();
  }

  const scoped = tenantScope(req.tenantId!);
  const subscription = await scoped.subscription.get();

  if (!subscription) {
    return res.status(402).json({ ok: false, error: 'Start a subscription to continue.' });
  }

  if (subscription.status === 'active') {
    // Backstop against a missed/lost cancellation or expiry webhook (this
    // protects BOTH providers, not just one) — e.g. PayPal's
    // BILLING.SUBSCRIPTION.ACTIVATED fires at trial-approval time, before
    // any real charge, and maps straight to 'active'; if the eventual
    // cancel webhook never arrives, nothing would otherwise re-check
    // whether this subscription is still actually current. Only self-heals
    // once currentPeriodEnd is BOTH set and well past the grace window — a
    // freshly-activated row with no currentPeriodEnd yet, or one still
    // within its current period, passes through untouched, same as before.
    const periodExpired = subscription.currentPeriodEnd
      ? Date.now() - subscription.currentPeriodEnd.getTime() > GRACE_PERIOD_MS
      : false;
    if (!periodExpired) {
      return next();
    }
    // No webhook has confirmed this subscription is still current for well
    // over the grace window — self-heal the same way the trialing/past_due
    // branches below do, so a second request doesn't re-derive the same
    // conclusion from scratch.
    await scoped.subscription.updateStatus('lapsed').catch(() => {});
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

  return res.status(402).json({ ok: false, error: 'Your subscription has lapsed. Choose a plan to continue.' });
}
