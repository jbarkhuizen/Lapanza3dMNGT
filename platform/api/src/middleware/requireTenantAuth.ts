import type { Request, Response, NextFunction, ParamsDictionary } from 'express-serve-static-core';
import type { ParsedQs } from 'qs';
import { env } from '../env.js';
import { getSession } from '../auth/session.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      tenantId?: string;
    }
  }
}

// Kept as a genuinely generic function (not a value typed to a single fixed
// `RequestHandler`) so it stays assignable when passed alongside a route's
// own handler to the same `router.get(path, requireTenantAuth, handler)`
// call, for any route param shape `P` — a concretely-typed middleware here
// makes TypeScript's route-matcher overload resolution fall back to the
// loose `ParamsDictionary` shape (whose values are `string | string[]`) for
// the WHOLE route, breaking the route handler's own `req.params.id: string`
// inference.
export async function requireTenantAuth<P = ParamsDictionary>(
  req: Request<P, unknown, unknown, ParsedQs, Record<string, unknown>>,
  res: Response<unknown, Record<string, unknown>>,
  next: NextFunction,
) {
  if (req.tenantId) {
    return next();
  }

  const token = req.cookies?.[env.sessionCookieName];
  if (!token) {
    return res.status(401).json({ ok: false, error: 'Log in to continue.' });
  }

  const session = await getSession(token);
  if (!session || session.subjectType !== 'tenant') {
    return res.status(401).json({ ok: false, error: 'Log in to continue.' });
  }

  req.tenantId = session.subjectId;
  next();
}
