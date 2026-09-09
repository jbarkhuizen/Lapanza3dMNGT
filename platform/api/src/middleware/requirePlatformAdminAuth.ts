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
  if (!token) {
    return res.redirect('/api/admin/login');
  }

  const session = await getSession(token);
  if (!session || session.subjectType !== 'platform_admin') {
    return res.redirect('/api/admin/login');
  }

  req.platformAdminId = session.subjectId;
  next();
}
