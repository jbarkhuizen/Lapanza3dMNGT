import type { Request, Response, NextFunction } from 'express';
import { env } from '../env.js';
import { getSession } from '../auth/session.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      platformAdminId?: string;
    }
  }
}

export async function requirePlatformAdminAuth(req: Request, res: Response, next: NextFunction) {
  if (req.platformAdminId) {
    return next();
  }

  const token = req.cookies?.[env.sessionCookieName];
  // See requireTenantAuth.ts's matching comment: cookie-parser auto-JSON-
  // parses any "j:..." cookie value, so `token` can be a non-string object
  // here despite its declared type -- explicitly rejected rather than
  // relying solely on getSession()'s own internal guard.
  if (typeof token !== 'string' || token.length === 0) {
    return res.redirect('/api/admin/login');
  }

  const session = await getSession(token);
  if (!session || session.subjectType !== 'platform_admin') {
    return res.redirect('/api/admin/login');
  }

  req.platformAdminId = session.subjectId;
  next();
}
