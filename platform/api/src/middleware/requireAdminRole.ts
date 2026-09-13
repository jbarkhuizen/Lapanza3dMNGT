import type { Request, Response, NextFunction, ParamsDictionary } from 'express-serve-static-core';
import type { ParsedQs } from 'qs';

// Runs AFTER requireTenantAuth (and requireActiveSubscription, where a route
// also has that) in a route chain. It decides ONLY "can this actor touch
// admin-only routes" — requireTenantAuth still does 100% of the "which
// tenant's rows" job everywhere, unchanged. Never let a role check alone
// stand in for tenant scoping.
//
// Kept as a genuinely generic function for the same reason as
// requireTenantAuth/requireActiveSubscription — see requireTenantAuth.ts.
export async function requireAdminRole<P = ParamsDictionary>(
  req: Request<P, unknown, unknown, ParsedQs, Record<string, unknown>>,
  res: Response<unknown, Record<string, unknown>>,
  next: NextFunction,
) {
  if (req.actorRole !== 'admin') {
    return res.status(403).json({ ok: false, error: 'Only an account admin can do this.' });
  }
  next();
}
