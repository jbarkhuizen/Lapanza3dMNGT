import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { prisma } from '../db/client.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { createSession, destroySession } from '../auth/session.js';
import { env } from '../env.js';
import { requirePlatformAdminAuth } from '../middleware/requirePlatformAdminAuth.js';
import { adminPage, escapeHtml } from '../lib/adminHtml.js';
import { providers } from './billing.js';

export const adminRouter = Router();

// Highest-value login target in the whole app — a compromised admin
// account reaches every tenant's data. Same shape as auth.ts's own
// loginLimiter.
//
// Unlike auth.ts's loginLimiter, this one is NOT built inside a
// per-buildApp() factory — adminRouter is a module-level singleton, so
// this limiter instance (and its hit counter) persists for the entire
// process, not just one app instance. admin.test.ts calls buildApp()
// once for the whole file and re-authenticates as admin in most of its
// tests (each beforeEach wipes the sessions table), which legitimately
// exceeds 10 logins well before the file finishes. Widening the budget
// under NODE_ENV=test only — production and development keep the real
// 10/hour — avoids that cross-test bleed without weakening the actual
// brute-force protection anywhere it matters.
const adminLoginLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: env.nodeEnv === 'test' ? 1000 : 10,
  standardHeaders: true,
  legacyHeaders: false,
});

// Route paths below are relative to this router's mount point
// (app.use('/api/admin', adminRouter) in app.ts) — Express strips the
// mount prefix before matching sub-router routes, so these must NOT
// repeat '/api/admin'. res.redirect() targets stay absolute since
// those are full URLs sent to the browser, not router route patterns.
adminRouter.get('/login', (req, res) => {
  const showError = req.query.error === '1';
  res.type('html').send(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Admin login &mdash; Barkie</title>
<style>
  body { font-family: ui-sans-serif, system-ui, sans-serif; background: #f7f3eb; color: #1a1612; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
  .card { background: #efe7d8; border: 1px solid #e0d8c8; border-radius: 8px; padding: 32px; width: 320px; }
  h1 { font-size: 18px; margin: 0 0 16px; }
  input { width: 100%; box-sizing: border-box; font-family: inherit; font-size: 14px; padding: 10px; margin-bottom: 12px; border: 1px solid #cbbfa8; border-radius: 4px; }
  button { width: 100%; font-family: inherit; font-size: 14px; padding: 10px; border: none; border-radius: 4px; background: #c24b28; color: #fff; cursor: pointer; }
  .error { color: #c24b28; font-weight: 600; margin-bottom: 12px; }
</style>
</head>
<body>
<div class="card">
<h1>Barkie Admin</h1>
${showError ? '<p class="error">Wrong email or password.</p>' : ''}
<form method="post" action="/api/admin/login">
<input type="email" name="email" placeholder="Email" required />
<input type="password" name="password" placeholder="Password" required />
<button type="submit">Log in</button>
</form>
</div>
</body>
</html>`);
});

adminRouter.post('/login', adminLoginLimiter, async (req, res) => {
  const { email, password } = (req.body ?? {}) as Record<string, unknown>;
  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.redirect('/api/admin/login?error=1');
  }

  const admin = await prisma.platformAdmin.findUnique({ where: { email } });
  if (!admin || !(await verifyPassword(password, admin.passwordHash))) {
    return res.redirect('/api/admin/login?error=1');
  }

  const { token, expiresAt } = await createSession('platform_admin', admin.id);
  res.cookie(env.sessionCookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.nodeEnv === 'production',
    expires: expiresAt,
  });
  res.redirect('/api/admin');
});

adminRouter.post('/logout', requirePlatformAdminAuth, async (req, res) => {
  const token = req.cookies?.[env.sessionCookieName];
  if (token) {
    await destroySession(token);
  }
  res.clearCookie(env.sessionCookieName);
  res.redirect('/api/admin/login');
});

adminRouter.get('/', requirePlatformAdminAuth, (_req, res) => {
  res.type('html').send(adminPage('Dashboard', `
    <ul>
      <li><a href="/api/admin/tenants">Tenants</a></li>
      <li><a href="/api/admin/plans">Plans</a></li>
    </ul>
  `));
});

adminRouter.get('/tenants', requirePlatformAdminAuth, async (_req, res) => {
  const tenants = await prisma.tenant.findMany({
    orderBy: { createdAt: 'desc' },
    include: { subscription: true },
  });
  const rows = tenants.map((t) => `
    <tr>
      <td><a href="/api/admin/tenants/${t.id}">${escapeHtml(t.businessName)}</a></td>
      <td>${escapeHtml(t.email)}</td>
      <td>${t.createdAt.toISOString().slice(0, 10)}</td>
      <td>${t.emailVerifiedAt ? 'Yes' : 'No'}</td>
      <td>${t.subscription ? escapeHtml(t.subscription.status) : 'None'}</td>
    </tr>`).join('');
  res.type('html').send(adminPage('Tenants', `
    <table>
      <thead><tr><th>Business</th><th>Email</th><th>Signed up</th><th>Verified</th><th>Subscription</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5">No tenants yet.</td></tr>'}</tbody>
    </table>
  `));
});

adminRouter.get('/tenants/:id', requirePlatformAdminAuth, async (req, res) => {
  const tenant = await prisma.tenant.findUnique({
    where: { id: req.params.id as string },
    include: { subscription: { include: { plan: true } } },
  });
  if (!tenant) {
    return res.status(404).type('html').send(adminPage('Not found', '<p>No such tenant.</p>'));
  }

  const editForm = `
    <div class="card">
      <h2>Edit tenant</h2>
      <form method="post" action="/api/admin/tenants/${tenant.id}/edit">
        <label>Business name<br /><input name="businessName" value="${escapeHtml(tenant.businessName)}" required /></label><br /><br />
        <label>Contact name<br /><input name="contactName" value="${escapeHtml(tenant.contactName)}" required /></label><br /><br />
        <label>Email<br /><input type="email" name="email" value="${escapeHtml(tenant.email)}" required /></label><br /><br />
        <button type="submit">Save</button>
      </form>
    </div>`;

  const sub = tenant.subscription;
  let subscriptionSection: string;
  if (!sub || sub.status === 'canceled' || sub.status === 'lapsed') {
    const plans = await prisma.plan.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } });
    const planOptions = plans.map((p) => `<option value="${p.id}">${escapeHtml(p.name)} (R${p.monthlyPrice.toFixed(2)})</option>`).join('');
    subscriptionSection = `
      <div class="card">
        <h2>Subscription</h2>
        <p>${sub ? `Currently ${escapeHtml(sub.status)}.` : 'No subscription.'}</p>
        <form method="post" action="/api/admin/tenants/${tenant.id}/subscription/grant">
          <label>Grant plan<br />
            <select name="planId" required>${planOptions}</select>
          </label>
          <button type="submit">Grant subscription</button>
        </form>
      </div>`;
  } else {
    const statusOptions = ['trialing', 'active', 'past_due', 'lapsed', 'canceled']
      .map((s) => `<option value="${s}" ${s === sub.status ? 'selected' : ''}>${s}</option>`)
      .join('');
    subscriptionSection = `
      <div class="card">
        <h2>Subscription</h2>
        <p>${escapeHtml(sub.plan.name)} &mdash; status <strong>${escapeHtml(sub.status)}</strong>,
        trial ends ${sub.trialEndsAt.toISOString().slice(0, 10)},
        period ends ${sub.currentPeriodEnd ? sub.currentPeriodEnd.toISOString().slice(0, 10) : '&mdash;'}</p>
        <form method="post" action="/api/admin/tenants/${tenant.id}/subscription/adjust">
          <label>Status<br />
            <select name="status">${statusOptions}</select>
          </label>
          <label>Extend period end to<br /><input type="date" name="currentPeriodEnd" /></label>
          <button type="submit">Save</button>
        </form>
        <form method="post" action="/api/admin/tenants/${tenant.id}/subscription/cancel" style="margin-top:12px">
          <button type="submit">Cancel subscription</button>
        </form>
      </div>`;
  }

  res.type('html').send(adminPage(tenant.businessName, `
    ${editForm}
    ${subscriptionSection}
    <p><a href="/api/admin/tenants/${tenant.id}/quotes">View quotes</a> &middot; <a href="/api/admin/tenants/${tenant.id}/invoices">View invoices</a></p>
  `));
});

adminRouter.post('/tenants/:id/edit', requirePlatformAdminAuth, async (req, res) => {
  const { businessName, contactName, email } = (req.body ?? {}) as Record<string, unknown>;
  if (typeof businessName !== 'string' || typeof contactName !== 'string' || typeof email !== 'string') {
    return res.redirect(`/api/admin/tenants/${req.params.id}`);
  }
  await prisma.tenant.update({
    where: { id: req.params.id as string },
    data: { businessName, contactName, email },
  });
  res.redirect(`/api/admin/tenants/${req.params.id}`);
});

adminRouter.post(
  '/tenants/:id/subscription/grant',
  requirePlatformAdminAuth,
  async (req: Request<{ id: string }>, res: Response) => {
    const tenantId = req.params.id;
    const { planId } = (req.body ?? {}) as Record<string, unknown>;
    if (typeof planId !== 'string') {
      return res.redirect(`/api/admin/tenants/${tenantId}`);
    }

    const existing = await prisma.subscription.findUnique({ where: { tenantId } });
    if (existing) {
      await prisma.subscription.delete({ where: { tenantId } });
    }

    const now = new Date();
    await prisma.subscription.create({
      data: {
        tenantId,
        planId,
        status: 'active',
        paymentProvider: 'manual',
        providerSubscriptionId: null,
        trialEndsAt: now,
        currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    res.redirect(`/api/admin/tenants/${tenantId}`);
  },
);

const VALID_SUBSCRIPTION_STATUSES = ['trialing', 'active', 'past_due', 'lapsed', 'canceled'];

adminRouter.post(
  '/tenants/:id/subscription/adjust',
  requirePlatformAdminAuth,
  async (req: Request<{ id: string }>, res: Response) => {
    const tenantId = req.params.id;
    const { status, currentPeriodEnd } = (req.body ?? {}) as Record<string, unknown>;
    if (typeof status !== 'string' || !VALID_SUBSCRIPTION_STATUSES.includes(status)) {
      return res.redirect(`/api/admin/tenants/${tenantId}`);
    }

    const existing = await prisma.subscription.findUnique({ where: { tenantId } });
    if (!existing) {
      return res.redirect(`/api/admin/tenants/${tenantId}`);
    }

    const data: { status: string; currentPeriodEnd?: Date; pastDueSince?: Date | null } = { status };
    if (typeof currentPeriodEnd === 'string' && currentPeriodEnd.trim() !== '') {
      const parsed = new Date(currentPeriodEnd);
      if (!Number.isNaN(parsed.getTime())) {
        data.currentPeriodEnd = parsed;
      }
    }

    // Mirror webhooks.ts's applyEvent semantics for pastDueSince so an
    // admin's manual status change doesn't diverge from the real
    // webhook-driven flow (see webhooks.ts lines 69-78 for the full
    // reasoning): stamp it on first entry into 'past_due' (never
    // re-stamp — that would reset the 7-day grace clock), and clear it
    // unconditionally whenever the NEW status becomes 'active' —
    // regardless of what the row's prior status was. This matters
    // because requireActiveSubscription's self-heal (scoped.ts's
    // updateStatus, ~line 582) can flip a 'past_due' row to 'lapsed'
    // without touching pastDueSince, so keying the clear branch on
    // existing.status (the pre-update value) would miss that case and
    // leave a stale timestamp behind. Any transition whose NEW status
    // is neither 'past_due' nor 'active' (e.g. 'active' -> 'trialing',
    // 'active' -> 'canceled') leaves pastDueSince untouched.
    if (status === 'past_due') {
      data.pastDueSince = existing.pastDueSince ?? new Date();
    } else if (status === 'active') {
      data.pastDueSince = null;
    }

    await prisma.subscription.update({ where: { tenantId }, data });
    res.redirect(`/api/admin/tenants/${tenantId}`);
  },
);

adminRouter.post(
  '/tenants/:id/subscription/cancel',
  requirePlatformAdminAuth,
  async (req: Request<{ id: string }>, res: Response) => {
    const tenantId = req.params.id;
    const subscription = await prisma.subscription.findUnique({ where: { tenantId } });
    if (!subscription) {
      return res.redirect(`/api/admin/tenants/${tenantId}`);
    }

    if (!subscription.providerSubscriptionId) {
      await prisma.subscription.update({ where: { tenantId }, data: { status: 'canceled' } });
      return res.redirect(`/api/admin/tenants/${tenantId}`);
    }

    const provider = providers[subscription.paymentProvider];
    if (!provider) {
      // Should be unreachable: an admin-granted subscription never sets
      // providerSubscriptionId, so any row that reaches here with one set
      // has a real paymentProvider ('payfast'/'paypal') from a genuine
      // signup. Fail loudly rather than silently cancel-and-move-on if
      // that invariant is ever violated.
      return res.status(500).type('html').send(adminPage('Error', '<p class="error">Unrecognized payment provider on this subscription &mdash; refusing to cancel. Check the database directly.</p>'));
    }

    // No try/catch, deliberately — same fail-closed contract as
    // POST /api/billing/cancel: a provider-cancel failure must not let
    // local status flip to canceled while the real subscription keeps
    // charging. A throw here propagates to Express's error handler.
    await provider.cancelSubscription(subscription.providerSubscriptionId);
    await prisma.subscription.update({ where: { tenantId }, data: { status: 'canceled' } });
    res.redirect(`/api/admin/tenants/${tenantId}`);
  },
);
