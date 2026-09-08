import crypto from 'node:crypto';
import { prisma } from '../db/client.js';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export async function createSession(subjectType: 'tenant' | 'platform_admin', subjectId: string) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({
    data: { token, subjectType, subjectId, expiresAt },
  });
  return { token, expiresAt };
}

export async function destroySession(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { token } });
}

export async function getSession(token: string): Promise<{ subjectType: string; subjectId: string } | null> {
  const session = await prisma.session.findUnique({ where: { token } });
  if (!session) {
    return null;
  }
  if (session.expiresAt < new Date()) {
    // Self-pruning: an expired session naturally encountered by real
    // traffic gets cleaned up here — no scheduled job needed. See
    // backlog item #12.
    await prisma.session.deleteMany({ where: { token } });
    return null;
  }
  return { subjectType: session.subjectType, subjectId: session.subjectId };
}
