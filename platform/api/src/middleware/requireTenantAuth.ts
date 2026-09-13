import type { Request, Response, NextFunction, ParamsDictionary } from 'express-serve-static-core';
import type { ParsedQs } from 'qs';
import { env } from '../env.js';
import { getSession } from '../auth/session.js';
import { prisma } from '../db/client.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      tenantId?: string;
      actorRole?: 'admin' | 'sales';
      // Set only when the current session is a team member (never for the
      // tenant owner) — the team member's own id, distinct from
      // req.tenantId (which is always the OWNING tenant's id). Lets
      // GET /api/auth/me look up that member's own name/email without
      // re-deriving session identity from the cookie a second time.
      actorId?: string;
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
  if (!session || (session.subjectType !== 'tenant' && session.subjectType !== 'team_member')) {
    return res.status(401).json({ ok: false, error: 'Log in to continue.' });
  }

  if (session.subjectType === 'tenant') {
    // The owner is always full-admin.
    req.tenantId = session.subjectId;
    req.actorRole = 'admin';
    return next();
  }

  // 'team_member' — resolve to the OWNING tenant's id (never the team
  // member's own id), so every existing tenant-scoped query keeps working
  // unmodified: it only ever reads req.tenantId. Re-checked on every
  // request (not just at login) so a member deactivated mid-session is
  // rejected on the very next request, not just at their next login.
  const teamMember = await prisma.teamMember.findUnique({ where: { id: session.subjectId } });
  if (!teamMember || !teamMember.active) {
    return res.status(401).json({ ok: false, error: 'Log in to continue.' });
  }
  req.tenantId = teamMember.tenantId;
  req.actorRole = teamMember.role === 'admin' ? 'admin' : 'sales';
  req.actorId = teamMember.id;
  next();
}
