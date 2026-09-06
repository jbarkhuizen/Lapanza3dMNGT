import type { Request, Response, NextFunction } from 'express';
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

export async function requireTenantAuth(req: Request, res: Response, next: NextFunction) {
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
