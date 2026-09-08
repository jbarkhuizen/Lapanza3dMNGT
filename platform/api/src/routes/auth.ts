import { Router } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import { Prisma } from '@prisma/client';
import rateLimit from 'express-rate-limit';
import { prisma } from '../db/client.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { sendVerificationEmail } from '../auth/email.js';
import { createSession, destroySession } from '../auth/session.js';
import { requireTenantAuth } from '../middleware/requireTenantAuth.js';
import { env } from '../env.js';

export function createAuthRouter() {
  const authRouter = Router();

  // Login is the highest-frequency, most brute-forceable of the three
  // account-lifecycle actions, so it gets its own bucket. Register and
  // resend-verification are both low-frequency "something's wrong with
  // my account" actions and share one — see backlog item #8.
  const loginLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
  });

  const accountLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
  });

  const registerSchema = z.object({
    businessName: z.string().min(1),
    contactName: z.string().min(1),
    email: z.string().email(),
    password: z.string().min(10),
  });

  authRouter.post('/api/auth/register', accountLimiter, async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: 'Fill in all required fields with a valid email and a password of at least 10 characters.' });
    }
    const { businessName, contactName, email, password } = parsed.data;

    const existing = await prisma.tenant.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ ok: false, error: 'An account with this email already exists.' });
    }

    const passwordHash = await hashPassword(password);
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    try {
      await prisma.tenant.create({
        data: {
          businessName,
          contactName,
          email,
          passwordHash,
          verificationToken,
          verificationTokenExpires,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return res.status(409).json({ ok: false, error: 'An account with this email already exists.' });
      }
      throw error;
    }

    try {
      await sendVerificationEmail(email, verificationToken);
    } catch (error) {
      // The tenant row is already committed above — don't 500 and strand
      // an unverifiable account over a transient SMTP failure. Logged for
      // operator follow-up; see backlog item #001 (resend-verification
      // endpoint) for the user-facing fix to this same failure class.
      console.error(`Failed to send verification email to ${email}:`, error);
    }

    res.status(201).json({ ok: true });
  });

  const verifyEmailSchema = z.object({ token: z.string().min(1) });

  authRouter.post('/api/auth/verify-email', async (req, res) => {
    const parsed = verifyEmailSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: 'A verification token is required.' });
    }

    const tenant = await prisma.tenant.findFirst({
      where: { verificationToken: parsed.data.token },
    });

    if (!tenant || !tenant.verificationTokenExpires || tenant.verificationTokenExpires < new Date()) {
      return res.status(400).json({ ok: false, error: 'This verification link is invalid or has expired.' });
    }

    await prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        emailVerifiedAt: new Date(),
        verificationToken: null,
        verificationTokenExpires: null,
      },
    });

    res.json({ ok: true });
  });

  const resendVerificationSchema = z.object({ email: z.string().email() });

  authRouter.post('/api/auth/resend-verification', accountLimiter, async (req, res) => {
    const parsed = resendVerificationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: 'Enter a valid email address.' });
    }

    const tenant = await prisma.tenant.findUnique({ where: { email: parsed.data.email } });
    if (!tenant) {
      return res.status(404).json({ ok: false, error: 'No account found with this email.' });
    }
    if (tenant.emailVerifiedAt) {
      return res.status(400).json({ ok: false, error: 'This account is already verified. Log in instead.' });
    }

    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { verificationToken, verificationTokenExpires },
    });

    try {
      await sendVerificationEmail(tenant.email, verificationToken);
    } catch (error) {
      // The fresh token is already persisted above — don't 500 and
      // discard it over a transient SMTP failure. Same pattern as
      // POST /api/auth/register's own hardening.
      console.error(`Failed to resend verification email to ${tenant.email}:`, error);
    }

    res.json({ ok: true });
  });

  const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

  authRouter.post('/api/auth/login', loginLimiter, async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: 'Enter your email and password.' });
    }

    const tenant = await prisma.tenant.findUnique({ where: { email: parsed.data.email } });
    const valid = tenant ? await verifyPassword(parsed.data.password, tenant.passwordHash) : false;
    if (!tenant || !valid) {
      return res.status(401).json({ ok: false, error: 'Incorrect email or password.' });
    }

    if (!tenant.emailVerifiedAt) {
      return res.status(403).json({ ok: false, error: 'Verify your email address before logging in.' });
    }

    const { token, expiresAt } = await createSession('tenant', tenant.id);
    res.cookie(env.sessionCookieName, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.nodeEnv === 'production',
      expires: expiresAt,
    });
    res.json({ ok: true });
  });

  authRouter.post('/api/auth/logout', async (req, res) => {
    const token = req.cookies?.[env.sessionCookieName];
    if (token) {
      await destroySession(token);
    }
    res.clearCookie(env.sessionCookieName);
    res.json({ ok: true });
  });

  authRouter.get('/api/auth/me', requireTenantAuth, async (req, res) => {
    const tenant = await prisma.tenant.findUnique({ where: { id: req.tenantId } });
    if (!tenant) {
      return res.status(401).json({ ok: false, error: 'Log in to continue.' });
    }
    res.json({
      ok: true,
      tenant: {
        id: tenant.id,
        businessName: tenant.businessName,
        email: tenant.email,
        emailVerified: tenant.emailVerifiedAt !== null,
      },
    });
  });

  return authRouter;
}
