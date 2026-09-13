import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { requireTenantAuth } from '../middleware/requireTenantAuth.js';
import { requireActiveSubscription } from '../middleware/requireActiveSubscription.js';
import { requireAdminRole } from '../middleware/requireAdminRole.js';
import { prisma } from '../db/client.js';
import { hashPassword } from '../auth/password.js';
import { sendTeamInviteEmail } from '../auth/email.js';

export const teamRouter = Router();
// Auth/subscription/role gating is applied per-route (not via a blanket
// `.use()`) so a genuinely unmatched path that falls through to this
// router doesn't get a misleading 401/403 — it falls through to the next
// router / app.ts's final 404 handler instead. See backlog #6.
// POST /api/team/set-password is the one exception — the invitee has no
// session yet, so it deliberately carries none of this router's usual
// middleware.

const MAX_ACTIVE_TEAM_MEMBERS = 3;
const SET_PASSWORD_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

function serializeTeamMember(member: {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  passwordHash: string | null;
  createdAt: Date;
}) {
  return {
    id: member.id,
    name: member.name,
    email: member.email,
    role: member.role,
    active: member.active,
    // A member with no passwordHash yet has never completed their
    // set-password link — surfaced so the UI can show "Invited" vs
    // "Active" instead of relying on `active` alone (which is true for
    // both — see the invite route's cap-counting comment).
    hasSetPassword: member.passwordHash !== null,
    createdAt: member.createdAt,
  };
}

teamRouter.get('/api/team', requireTenantAuth, requireActiveSubscription, requireAdminRole, async (req, res) => {
  const members = await prisma.teamMember.findMany({
    where: { tenantId: req.tenantId! },
    orderBy: { createdAt: 'asc' },
  });
  res.json({ ok: true, teamMembers: members.map(serializeTeamMember) });
});

const inviteSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.enum(['admin', 'sales']),
});

teamRouter.post('/api/team/invite', requireTenantAuth, requireActiveSubscription, requireAdminRole, async (req, res) => {
  const parsed = inviteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: 'A name, valid email, and role are required.' });
  }
  const { name, email, role } = parsed.data;

  // A newly-invited member counts as "active" immediately (their `active`
  // flag defaults to true even before they've set a password) — matches
  // the reference screenshot's "0 of 3 active members" cap counting
  // invited-but-not-yet-activated seats too.
  const activeCount = await prisma.teamMember.count({ where: { tenantId: req.tenantId!, active: true } });
  if (activeCount >= MAX_ACTIVE_TEAM_MEMBERS) {
    return res.status(400).json({ ok: false, error: `You can have at most ${MAX_ACTIVE_TEAM_MEMBERS} active team members.` });
  }

  // Defensive: email is globally unique per-table (TeamMember.email and
  // Tenant.email each carry their own @unique constraint — see the schema
  // comment), but nothing stops the SAME address existing in both tables.
  // Login always checks Tenant first (see auth.ts), so a team member whose
  // email collided with an existing tenant's would be permanently
  // unreachable via login. Reject that case explicitly here rather than
  // create an account nobody could ever sign into.
  const collidingTenant = await prisma.tenant.findUnique({ where: { email } });
  if (collidingTenant) {
    return res.status(409).json({ ok: false, error: 'An account with this email already exists.' });
  }

  const setPasswordToken = crypto.randomBytes(32).toString('hex');
  const setPasswordTokenExpires = new Date(Date.now() + SET_PASSWORD_TOKEN_TTL_MS);

  let member;
  try {
    member = await prisma.teamMember.create({
      data: {
        tenantId: req.tenantId!,
        name,
        email,
        role,
        passwordHash: null,
        setPasswordToken,
        setPasswordTokenExpires,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return res.status(409).json({ ok: false, error: 'An account with this email already exists.' });
    }
    throw error;
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: req.tenantId! } });

  try {
    await sendTeamInviteEmail(email, tenant?.businessName ?? 'Barkie', setPasswordToken);
  } catch (error) {
    // The team-member row is already committed above — don't 500 and
    // strand an uninvitable member over a transient SMTP failure. Same
    // tolerance as POST /api/auth/register's own hardening.
    console.error(`Failed to send team invite email to ${email}:`, error);
  }

  res.status(201).json({ ok: true, teamMember: serializeTeamMember(member) });
});

const setPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(10),
});

// No auth required — the invitee has no session yet.
teamRouter.post('/api/team/set-password', async (req, res) => {
  const parsed = setPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: 'A token and a password of at least 10 characters are required.' });
  }
  const { token, password } = parsed.data;

  const member = await prisma.teamMember.findFirst({ where: { setPasswordToken: token } });
  if (!member || !member.setPasswordTokenExpires || member.setPasswordTokenExpires < new Date()) {
    return res.status(400).json({ ok: false, error: 'This link is invalid or has expired.' });
  }

  const passwordHash = await hashPassword(password);
  await prisma.teamMember.update({
    where: { id: member.id },
    data: { passwordHash, setPasswordToken: null, setPasswordTokenExpires: null },
  });

  res.json({ ok: true });
});

const patchTeamMemberSchema = z
  .object({
    active: z.boolean().optional(),
    role: z.enum(['admin', 'sales']).optional(),
  })
  .refine((data) => data.active !== undefined || data.role !== undefined, {
    message: 'Nothing to update.',
  });

teamRouter.patch('/api/team/:id', requireTenantAuth, requireActiveSubscription, requireAdminRole, async (req, res) => {
  const parsed = patchTeamMemberSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: 'Invalid team member fields.' });
  }

  // Deactivating here immediately invalidates that member's ability to
  // pass requireTenantAuth on their very next request — it re-checks
  // `active` on every request, not just at login.
  const result = await prisma.teamMember.updateMany({
    where: { id: req.params.id, tenantId: req.tenantId! },
    data: parsed.data,
  });
  if (result.count === 0) {
    return res.status(404).json({ ok: false, error: 'Team member not found.' });
  }
  const updated = await prisma.teamMember.findUnique({ where: { id: req.params.id } });
  res.json({ ok: true, teamMember: updated ? serializeTeamMember(updated) : null });
});

teamRouter.delete('/api/team/:id', requireTenantAuth, requireActiveSubscription, requireAdminRole, async (req, res) => {
  // Scoped to tenantId so one tenant can't delete another tenant's member
  // by guessing an id — deleteMany (not delete) so a cross-tenant id
  // resolves to "0 rows affected" rather than throwing.
  const result = await prisma.teamMember.deleteMany({ where: { id: req.params.id, tenantId: req.tenantId! } });
  if (result.count === 0) {
    return res.status(404).json({ ok: false, error: 'Team member not found.' });
  }
  // Belt-and-braces: once the row is gone, requireTenantAuth's
  // TeamMember.findUnique already returns null and rejects any still-valid
  // token the same as `active: false` would — so this isn't load-bearing
  // for correctness, but it does mean a deleted member's session rows
  // don't linger in the sessions table forever.
  await prisma.session.deleteMany({ where: { subjectType: 'team_member', subjectId: req.params.id } });
  res.json({ ok: true });
});
