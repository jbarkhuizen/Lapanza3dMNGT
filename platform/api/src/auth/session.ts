import crypto from 'node:crypto';
import { prisma } from '../db/client.js';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export async function createSession(subjectType: 'tenant' | 'platform_admin' | 'team_member', subjectId: string) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({
    data: { token, subjectType, subjectId, expiresAt },
  });
  return { token, expiresAt };
}

// `token` is typed `unknown`, not `string`, deliberately -- every real
// caller reads it from `req.cookies[...]`, and cookie-parser's own runtime
// behavior does NOT match its `string` typing: it unconditionally runs
// `JSONCookies()` over every parsed cookie (see cookie-parser's `index.js`),
// so a cookie value starting with `j:` (e.g. `j:{"not":""}`) arrives here
// as a parsed JS object, not a string. Prisma's `where: { token }` accepts
// either a plain string OR a filter object (`{ not: '' }`, `{ contains: ''
// }`, etc.) for a string field, so an unguarded object here turns "find
// this one session" into "find every session matching this filter" --
// confirmed exploitable via POST /api/auth/logout (no auth middleware),
// which would delete every row in the Session table for the whole
// platform. This guard is the actual security boundary; call sites also
// guard before calling (see requireTenantAuth.ts, requirePlatformAdminAuth.ts,
// auth.ts, admin.ts) as defense in depth, but this function must never trust
// them to have done so correctly.
function isValidSessionToken(token: unknown): token is string {
  return typeof token === 'string' && token.length > 0;
}

export async function destroySession(token: unknown): Promise<void> {
  if (!isValidSessionToken(token)) {
    return;
  }
  await prisma.session.deleteMany({ where: { token } });
}

export async function getSession(token: unknown): Promise<{ subjectType: string; subjectId: string } | null> {
  if (!isValidSessionToken(token)) {
    return null;
  }
  const session = await prisma.session.findUnique({ where: { token } });
  if (!session) {
    return null;
  }
  if (session.expiresAt < new Date()) {
    // Self-pruning: an expired session naturally encountered by real
    // traffic gets cleaned up here — no scheduled job needed. See
    // backlog item #12. Best-effort: a delete failure (e.g. a transient
    // DB write issue) must not turn what should be a clean "session
    // expired" outcome into a 500 — the row would just get pruned on a
    // later request instead.
    await prisma.session.deleteMany({ where: { token } }).catch((error) => {
      console.error(`Failed to prune expired session ${token}:`, error);
    });
    return null;
  }
  return { subjectType: session.subjectType, subjectId: session.subjectId };
}
