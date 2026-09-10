import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { prisma } from '../db/client.js';
import { verifyPassword } from '../auth/password.js';
import { createSession, destroySession } from '../auth/session.js';
import { env } from '../env.js';
import { requirePlatformAdminAuth } from '../middleware/requirePlatformAdminAuth.js';
import { adminPage, badge, escapeHtml } from '../lib/adminHtml.js';
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
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300..700;1,9..40,300..700&family=Fraunces:opsz,wght@9..144,500..700&display=swap" rel="stylesheet" />
<style>
  :root {
    --bg: #f3eee4; --panel: #fffdf8; --ink: #1a1612; --muted: #6a5f54;
    --line: rgb(26 22 18 / 0.12); --brand: #c24b28; --bg-elevated: #faf7f1;
    --shadow: 0 18px 40px rgb(26 22 18 / 0.08); --radius: 14px;
    --font: "DM Sans", system-ui, sans-serif; --serif: "Fraunces", Georgia, serif;
    color-scheme: light;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #12100e; --panel: #1e1a16; --ink: #f4efe6; --muted: #b0a497;
      --line: rgb(244 239 230 / 0.12); --brand: #e06a45; --bg-elevated: #1a1714;
      --shadow: 0 18px 40px rgb(0 0 0 / 0.35);
      color-scheme: dark;
    }
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; min-height: 100%; }
  body {
    font-family: var(--font); color: var(--ink);
    background:
      radial-gradient(900px 500px at 100% 0%, rgb(194 75 40 / 0.12), transparent 55%),
      radial-gradient(700px 400px at 0% 100%, rgb(217 235 77 / 0.08), transparent 50%),
      var(--bg);
    display: flex; align-items: center; justify-content: center; height: 100vh;
  }
  .login-card {
    width: min(420px, 100%);
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: calc(var(--radius) + 4px);
    padding: 2rem;
    box-shadow: var(--shadow);
  }
  .login-card h1 { font-family: var(--serif); font-weight: 600; font-size: 2rem; margin: 0 0 0.5rem; letter-spacing: -0.03em; }
  input {
    width: 100%; box-sizing: border-box; font-family: inherit; font-size: 0.9rem;
    padding: 0.7rem 0.85rem; margin-bottom: 12px; border: 1px solid var(--line);
    background: var(--bg-elevated); color: var(--ink); border-radius: 10px;
  }
  button {
    width: 100%; font-family: inherit; font-size: 0.9rem; font-weight: 600;
    padding: 0.65rem 1.05rem; border: 1px solid var(--ink); border-radius: 999px;
    background: var(--ink); color: var(--bg); cursor: pointer;
  }
  .error { color: var(--danger, #b42318); font-weight: 600; margin-bottom: 12px; }
</style>
</head>
<body>
<div class="login-card">
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
    <div class="panel">
      <h2>Quick links</h2>
      <div class="stack gap-2">
        <a class="btn btn-secondary" href="/api/admin/tenants">Tenants</a>
        <a class="btn btn-secondary" href="/api/admin/plans">Plans</a>
        <a class="btn btn-secondary" href="/api/admin/backlog">Backlog</a>
      </div>
    </div>
  `, 'dashboard'));
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
    <div class="panel table-wrap">
      <table class="catalog">
        <thead><tr><th>Business</th><th>Email</th><th>Signed up</th><th>Verified</th><th>Subscription</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5">No tenants yet.</td></tr>'}</tbody>
      </table>
    </div>
  `, 'tenants'));
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
    <div class="panel">
      <h2>Edit tenant</h2>
      <form method="post" action="/api/admin/tenants/${tenant.id}/edit" class="stack gap-3">
        <div class="grid-2">
          <label class="field"><span>Business name</span><input name="businessName" value="${escapeHtml(tenant.businessName)}" required /></label>
          <label class="field"><span>Contact name</span><input name="contactName" value="${escapeHtml(tenant.contactName)}" required /></label>
        </div>
        <label class="field"><span>Email</span><input type="email" name="email" value="${escapeHtml(tenant.email)}" required /></label>
        <button type="submit" class="btn btn-primary">Save</button>
      </form>
    </div>`;

  const sub = tenant.subscription;
  // The grant and adjust/cancel forms are independent, non-exclusive
  // conditions per the design spec — NOT an if/else. A 'canceled' or
  // 'lapsed' row still exists (has a real row, possibly still a live
  // providerSubscriptionId at the real payment provider), so it must show
  // BOTH: adjust/cancel (to recover or clean up the existing row) and grant
  // (to hand the tenant a fresh comped subscription instead). Only a
  // genuinely absent subscription shows grant alone.
  const showGrantForm = !sub || sub.status === 'canceled' || sub.status === 'lapsed';
  const showAdjustForm = Boolean(sub);

  let subscriptionSection = '<div class="panel"><h2>Subscription</h2>';
  if (sub) {
    subscriptionSection += `
      <p>${escapeHtml(sub.plan.name)} &mdash; status ${badge(sub.status)},
      trial ends ${sub.trialEndsAt.toISOString().slice(0, 10)},
      period ends ${sub.currentPeriodEnd ? sub.currentPeriodEnd.toISOString().slice(0, 10) : '&mdash;'}</p>`;
  } else {
    subscriptionSection += '<p style="color:var(--muted)">No subscription.</p>';
  }

  if (showGrantForm) {
    const plans = await prisma.plan.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } });
    const planOptions = plans.map((p) => `<option value="${p.id}">${escapeHtml(p.name)} (R${p.monthlyPrice.toFixed(2)})</option>`).join('');
    subscriptionSection += `
      <form method="post" action="/api/admin/tenants/${tenant.id}/subscription/grant" class="stack gap-3" style="margin-top:12px">
        <label class="field"><span>Grant plan</span>
          <select name="planId" required>${planOptions}</select>
        </label>
        <button type="submit" class="btn btn-primary">Grant subscription</button>
      </form>`;
  }

  if (showAdjustForm && sub) {
    const statusOptions = ['trialing', 'active', 'past_due', 'lapsed', 'canceled']
      .map((s) => `<option value="${s}" ${s === sub.status ? 'selected' : ''}>${s}</option>`)
      .join('');
    subscriptionSection += `
      <form method="post" action="/api/admin/tenants/${tenant.id}/subscription/adjust" class="grid-2" style="margin-top:12px;align-items:end">
        <label class="field"><span>Status</span>
          <select name="status">${statusOptions}</select>
        </label>
        <label class="field"><span>Extend period end to</span><input type="date" name="currentPeriodEnd" /></label>
        <button type="submit" class="btn btn-primary">Save</button>
      </form>
      <form method="post" action="/api/admin/tenants/${tenant.id}/subscription/cancel" style="margin-top:12px">
        <button type="submit" class="btn btn-danger">Cancel subscription</button>
      </form>`;
  }
  subscriptionSection += '</div>';

  res.type('html').send(adminPage(tenant.businessName, `
    ${editForm}
    ${subscriptionSection}
    <p><a class="btn btn-secondary small" href="/api/admin/tenants/${tenant.id}/quotes">View quotes</a> <a class="btn btn-secondary small" href="/api/admin/tenants/${tenant.id}/invoices">View invoices</a></p>
  `, 'tenants'));
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

    // Must happen before anything irreversible (the provider-cancel call
    // below) runs. The grant form's <select> is only ever populated from
    // active plans (see the `prisma.plan.findMany({ where: { active: true
    // } })` call that builds it above, in the tenant-detail GET route) —
    // mirror that same active-plans set here so a hand-crafted request with
    // a bogus or inactive planId is rejected before it can cancel a
    // tenant's real subscription at the provider and only then fail the
    // local create on an FK violation, which would leave the old
    // provider-side subscription dead with no local record pointing back
    // at it.
    const plan = await prisma.plan.findUnique({ where: { id: planId } });
    if (!plan || !plan.active) {
      return res.redirect(`/api/admin/tenants/${tenantId}`);
    }

    const existing = await prisma.subscription.findUnique({ where: { tenantId } });
    const now = new Date();
    const newSubscriptionData = {
      tenantId,
      planId,
      status: 'active',
      paymentProvider: 'manual',
      providerSubscriptionId: null,
      trialEndsAt: now,
      currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    };

    if (existing) {
      // Mirrors billing.ts's resubscribe-over-an-existing-row logic
      // (POST /api/billing/checkout, lines ~115-155) exactly. A 'lapsed'
      // row can still carry a real providerSubscriptionId — self-heal in
      // requireActiveSubscription.ts only ever updates local status, never
      // calls the provider — so deleting it here without telling the
      // provider to stop would leave the tenant being billed by the real
      // provider forever, with no way back into the app to cancel it (both
      // POST /api/billing/cancel and the admin cancel route work by
      // looking up the row this would have just deleted). Best-effort: a
      // failure here (e.g. already canceled provider-side) must not block
      // the admin's grant.
      if (existing.providerSubscriptionId) {
        const oldProvider = providers[existing.paymentProvider];
        if (!oldProvider) {
          // Should be unreachable: an admin-granted subscription never sets
          // providerSubscriptionId, so any row that reaches here with one
          // set has a real paymentProvider ('payfast'/'paypal') from a
          // genuine signup. Fail loudly rather than let an unrecognized
          // value throw past the .catch() below — that .catch() only
          // swallows a failed *cancel call*, not a TypeError from indexing
          // `providers` with a bad key, so without this guard a bad value
          // here would turn this "never blocks the grant" best-effort path
          // into an unhandled 500. Same contract as the cancel route below.
          return res.status(500).type('html').send(adminPage('Error', '<p class="error">Unrecognized payment provider on this subscription &mdash; refusing to grant. Check the database directly.</p>'));
        }
        await oldProvider.cancelSubscription(existing.providerSubscriptionId).catch((error) => {
          console.error(
            `Failed to cancel previous ${existing.paymentProvider} subscription ${existing.providerSubscriptionId} during admin grant:`,
            error,
          );
        });
      }
      // The best-effort provider cancel above is an external network call
      // and stays outside this transaction — its .catch() swallow must not
      // change. But the delete-then-create pair that replaces the local
      // row IS purely local DB work, so it's wrapped in a single
      // transaction: a failure between the two (e.g. the create violating
      // a constraint on a bad planId) must not leave the tenant with zero
      // subscription rows and no way back in.
      await prisma.$transaction([
        prisma.subscription.deleteMany({ where: { tenantId } }),
        prisma.subscription.create({ data: newSubscriptionData }),
      ]);
    } else {
      await prisma.subscription.create({ data: newSubscriptionData });
    }
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
    let explicitPeriodEnd = false;
    if (typeof currentPeriodEnd === 'string' && currentPeriodEnd.trim() !== '') {
      const parsed = new Date(currentPeriodEnd);
      if (!Number.isNaN(parsed.getTime())) {
        data.currentPeriodEnd = parsed;
        explicitPeriodEnd = true;
      }
    }

    // Nothing on the page marks currentPeriodEnd as required, so an admin
    // recovering a tenant to 'active' can easily leave it untouched. If the
    // row's currentPeriodEnd is stale (e.g. weeks old from a past_due ->
    // lapsed history), requireActiveSubscription's self-heal (lines 23-38:
    // status === 'active' AND currentPeriodEnd more than GRACE_PERIOD_MS in
    // the past) would flip it straight back to 'lapsed' on the very next
    // tenant write, silently undoing this fix. Default it forward the same
    // way the grant route does (now + 30 days) whenever the admin is
    // setting status to 'active' and did NOT supply an explicit date —
    // but never override an intentionally-supplied one, and never touch a
    // row that isn't actually stale: an already-current paying subscription
    // (currentPeriodEnd comfortably in the future) must be left alone.
    // "Stale" is defined the same way requireActiveSubscription.ts's
    // GRACE_PERIOD_MS-based self-heal effectively treats it — missing, or
    // already at/past currentPeriodEnd — which covers both a row still
    // inside that 7-day grace window (not yet self-healed to 'lapsed') and
    // one already past it (would have self-healed). Anything still in the
    // future needs no help.
    const isCurrentPeriodEndStale = !existing.currentPeriodEnd || existing.currentPeriodEnd.getTime() <= Date.now();
    if (status === 'active' && !explicitPeriodEnd && isCurrentPeriodEndStale) {
      data.currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
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

// Read-only support-visibility views onto a tenant's quotes and invoices —
// no forms, no edit actions. Scoped strictly to tenantId from req.params.id
// via prisma directly (never tenantScope(), which is for tenant-session
// requests, not platform-admin ones).
adminRouter.get(
  '/tenants/:id/quotes',
  requirePlatformAdminAuth,
  async (req: Request<{ id: string }>, res: Response) => {
    const tenant = await prisma.tenant.findUnique({ where: { id: req.params.id } });
    if (!tenant) {
      return res.status(404).type('html').send(adminPage('Not found', '<p>No such tenant.</p>'));
    }
    const quotes = await prisma.quote.findMany({
      where: { tenantId: tenant.id },
      include: { customer: true },
      orderBy: { createdAt: 'desc' },
    });
    const rows = quotes.map((q) => `
      <tr>
        <td>${escapeHtml(q.number)}</td>
        <td>${escapeHtml(q.customer.name)}</td>
        <td>${escapeHtml(q.status)}</td>
        <td>R${q.total.toFixed(2)}</td>
        <td>${q.createdAt.toISOString().slice(0, 10)}</td>
      </tr>`).join('');
    res.type('html').send(adminPage(`${tenant.businessName} — Quotes`, `
      <p><a href="/api/admin/tenants/${tenant.id}">&larr; Back to tenant</a></p>
      <div class="panel table-wrap">
        <table class="catalog">
          <thead><tr><th>Number</th><th>Customer</th><th>Status</th><th>Total</th><th>Date</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="5">No quotes.</td></tr>'}</tbody>
        </table>
      </div>
    `, 'tenants'));
  },
);

adminRouter.get(
  '/tenants/:id/invoices',
  requirePlatformAdminAuth,
  async (req: Request<{ id: string }>, res: Response) => {
    const tenant = await prisma.tenant.findUnique({ where: { id: req.params.id } });
    if (!tenant) {
      return res.status(404).type('html').send(adminPage('Not found', '<p>No such tenant.</p>'));
    }
    const invoices = await prisma.invoice.findMany({
      where: { tenantId: tenant.id },
      include: { customer: true },
      orderBy: { createdAt: 'desc' },
    });
    const rows = invoices.map((inv) => `
      <tr>
        <td>${escapeHtml(inv.number)}</td>
        <td>${escapeHtml(inv.customer.name)}</td>
        <td>${escapeHtml(inv.status)}</td>
        <td>R${inv.total.toFixed(2)}</td>
        <td>R${inv.amountPaid.toFixed(2)}</td>
        <td>${inv.createdAt.toISOString().slice(0, 10)}</td>
      </tr>`).join('');
    res.type('html').send(adminPage(`${tenant.businessName} — Invoices`, `
      <p><a href="/api/admin/tenants/${tenant.id}">&larr; Back to tenant</a></p>
      <div class="panel table-wrap">
        <table class="catalog">
          <thead><tr><th>Number</th><th>Customer</th><th>Status</th><th>Total</th><th>Paid</th><th>Date</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="6">No invoices.</td></tr>'}</tbody>
        </table>
      </div>
    `, 'tenants'));
  },
);

// Plan is a platform-wide catalog table, never tenant-scoped — queried
// directly via prisma.plan, same as the plan lookups already used above
// for the tenant subscription-grant dropdown. No tenantScope() involved.
adminRouter.get('/plans', requirePlatformAdminAuth, async (_req, res) => {
  const plans = await prisma.plan.findMany({ orderBy: { sortOrder: 'asc' } });
  const rows = plans.map((p) => `
    <tr>
      <td>
        <form method="post" action="/api/admin/plans/${p.id}/edit" class="grid-3" style="align-items:end;gap:0.5rem">
          <label class="field"><span>Name</span><input name="name" value="${escapeHtml(p.name)}" required /></label>
          <label class="field"><span>Monthly price</span><span class="rand-input"><input name="monthlyPrice" value="${p.monthlyPrice.toFixed(2)}" required /></span></label>
          <label class="field"><span>Sort order</span><input name="sortOrder" type="number" value="${p.sortOrder}" required /></label>
          <label class="field checkbox"><input type="checkbox" name="active" ${p.active ? 'checked' : ''} /><span>Active</span></label>
          <button type="submit" class="btn btn-primary small">Save</button>
        </form>
      </td>
    </tr>`).join('');
  res.type('html').send(adminPage('Plans', `
    <div class="panel table-wrap">
      <table class="catalog"><tbody>${rows}</tbody></table>
    </div>
    <div class="panel">
      <h2>New plan</h2>
      <form method="post" action="/api/admin/plans" class="stack gap-3">
        <label class="field"><span>Name</span><input name="name" required /></label>
        <label class="field"><span>Monthly price (R)</span><span class="rand-input"><input name="monthlyPrice" required /></span></label>
        <label class="field"><span>Sort order</span><input name="sortOrder" type="number" required /></label>
        <button type="submit" class="btn btn-primary">Create plan</button>
      </form>
    </div>
  `, 'plans'));
});

adminRouter.post('/plans', requirePlatformAdminAuth, async (req, res) => {
  const { name, monthlyPrice, sortOrder } = (req.body ?? {}) as Record<string, unknown>;
  if (typeof name !== 'string' || typeof monthlyPrice !== 'string' || typeof sortOrder !== 'string') {
    return res.redirect('/api/admin/plans');
  }
  await prisma.plan.create({
    data: { name, monthlyPrice, sortOrder: Number(sortOrder) },
  });
  res.redirect('/api/admin/plans');
});

adminRouter.post(
  '/plans/:id/edit',
  requirePlatformAdminAuth,
  async (req: Request<{ id: string }>, res: Response) => {
    const { name, monthlyPrice, sortOrder, active } = (req.body ?? {}) as Record<string, unknown>;
    if (typeof name !== 'string' || typeof monthlyPrice !== 'string' || typeof sortOrder !== 'string') {
      return res.redirect('/api/admin/plans');
    }
    await prisma.plan.update({
      where: { id: req.params.id },
      data: { name, monthlyPrice, sortOrder: Number(sortOrder), active: active === 'on' },
    });
    res.redirect('/api/admin/plans');
  },
);

const BACKLOG_CATEGORIES = ['Bug', 'Feature', 'Enhancement', 'Tech Debt'];
const BACKLOG_PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];
const BACKLOG_STATUSES = ['Backlog', 'Done'];
const PRIORITY_RANK: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };

function truncate(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

adminRouter.get('/backlog', requirePlatformAdminAuth, async (req, res) => {
  const statusFilter = typeof req.query.status === 'string' ? req.query.status : 'Backlog';
  const where = statusFilter === 'all' ? {} : { status: statusFilter };
  const items = await prisma.backlogItem.findMany({ where, orderBy: { number: 'asc' } });
  items.sort((a, b) => (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9));

  const rows = items.map((item) => `
    <tr>
      <td>#${item.number}</td>
      <td><a href="/api/admin/backlog/${item.id}">${escapeHtml(item.title)}</a><br /><span style="color:var(--muted);font-size:13px">${escapeHtml(truncate(item.description, 140))}</span></td>
      <td>${escapeHtml(item.category)}</td>
      <td>${badge(item.priority)}</td>
      <td>${badge(item.status)}</td>
    </tr>`).join('');

  const filterLink = (value: string, label: string) => `<a class="nav-btn${statusFilter === value ? ' active' : ''}" style="display:inline-block" href="/api/admin/backlog?status=${encodeURIComponent(value)}">${label}</a>`;

  res.type('html').send(adminPage('Backlog', `
    <div class="panel" style="padding:0.5rem 0.75rem;display:inline-flex;gap:0.25rem;margin-bottom:1.25rem">
      ${filterLink('Backlog', 'Open')}${filterLink('Done', 'Done')}${filterLink('all', 'All')}
    </div>
    <div class="panel table-wrap">
      <table class="catalog">
        <thead><tr><th>#</th><th>Item</th><th>Category</th><th>Priority</th><th>Status</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5">No items.</td></tr>'}</tbody>
      </table>
    </div>
    <div class="panel">
      <h2>New backlog item</h2>
      <form method="post" action="/api/admin/backlog" class="stack gap-3">
        <label class="field"><span>Title</span><input name="title" required /></label>
        <label class="field"><span>Description</span><textarea name="description" rows="4" required></textarea></label>
        <div class="grid-2">
          <label class="field"><span>Category</span>
            <select name="category">${BACKLOG_CATEGORIES.map((c) => `<option value="${c}">${c}</option>`).join('')}</select>
          </label>
          <label class="field"><span>Priority</span>
            <select name="priority">${BACKLOG_PRIORITIES.map((p) => `<option value="${p}" ${p === 'Medium' ? 'selected' : ''}>${p}</option>`).join('')}</select>
          </label>
        </div>
        <button type="submit" class="btn btn-primary">Create item</button>
      </form>
    </div>
  `, 'backlog'));
});

adminRouter.post('/backlog', requirePlatformAdminAuth, async (req, res) => {
  const { title, description, category, priority } = (req.body ?? {}) as Record<string, unknown>;
  if (
    typeof title !== 'string' || title.trim() === '' ||
    typeof description !== 'string' || description.trim() === '' ||
    typeof category !== 'string' || !BACKLOG_CATEGORIES.includes(category) ||
    typeof priority !== 'string' || !BACKLOG_PRIORITIES.includes(priority)
  ) {
    return res.redirect('/api/admin/backlog');
  }

  const highest = await prisma.backlogItem.findFirst({ orderBy: { number: 'desc' } });
  const nextNumber = (highest?.number ?? 0) + 1;

  await prisma.backlogItem.create({
    data: {
      number: nextNumber,
      title,
      description,
      category,
      priority,
      status: 'Backlog',
      dateAdded: new Date(),
    },
  });
  res.redirect('/api/admin/backlog');
});

adminRouter.get('/backlog/:id', requirePlatformAdminAuth, async (req: Request<{ id: string }>, res: Response) => {
  const item = await prisma.backlogItem.findUnique({ where: { id: req.params.id } });
  if (!item) {
    return res.status(404).type('html').send(adminPage('Not found', '<p>No such backlog item.</p>'));
  }

  res.type('html').send(adminPage(`#${item.number} — ${item.title}`, `
    <p><a href="/api/admin/backlog">&larr; Back to backlog</a></p>
    <div class="panel" style="max-width:720px">
      <form method="post" action="/api/admin/backlog/${item.id}/edit" class="stack gap-3">
        <label class="field"><span>Title</span><input name="title" value="${escapeHtml(item.title)}" required /></label>
        <label class="field"><span>Description</span><textarea name="description" rows="10" required>${escapeHtml(item.description)}</textarea></label>
        <div class="grid-3">
          <label class="field"><span>Category</span>
            <select name="category">${BACKLOG_CATEGORIES.map((c) => `<option value="${c}" ${c === item.category ? 'selected' : ''}>${c}</option>`).join('')}</select>
          </label>
          <label class="field"><span>Priority</span>
            <select name="priority">${BACKLOG_PRIORITIES.map((p) => `<option value="${p}" ${p === item.priority ? 'selected' : ''}>${p}</option>`).join('')}</select>
          </label>
          <label class="field"><span>Status</span>
            <select name="status">${BACKLOG_STATUSES.map((s) => `<option value="${s}" ${s === item.status ? 'selected' : ''}>${s}</option>`).join('')}</select>
          </label>
        </div>
        <p style="color:var(--muted);font-size:13px">Added ${item.dateAdded.toISOString().slice(0, 10)}${item.actualFixDate ? ` &middot; Fixed ${item.actualFixDate.toISOString().slice(0, 10)}` : ''}</p>
        <button type="submit" class="btn btn-primary">Save</button>
      </form>
    </div>
  `, 'backlog'));
});

adminRouter.post('/backlog/:id/edit', requirePlatformAdminAuth, async (req: Request<{ id: string }>, res: Response) => {
  const { title, description, category, priority, status } = (req.body ?? {}) as Record<string, unknown>;
  if (
    typeof title !== 'string' || title.trim() === '' ||
    typeof description !== 'string' || description.trim() === '' ||
    typeof category !== 'string' || !BACKLOG_CATEGORIES.includes(category) ||
    typeof priority !== 'string' || !BACKLOG_PRIORITIES.includes(priority) ||
    typeof status !== 'string' || !BACKLOG_STATUSES.includes(status)
  ) {
    return res.redirect(`/api/admin/backlog/${req.params.id}`);
  }

  const existing = await prisma.backlogItem.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    return res.redirect('/api/admin/backlog');
  }

  // Stamp actualFixDate the moment a real transition into Done happens,
  // same "derive from the transition, not from a manually-editable field"
  // principle as the subscription pastDueSince logic elsewhere in this
  // file — never overwrite it once set, and clear it if reopened.
  let actualFixDate = existing.actualFixDate;
  if (status === 'Done' && existing.status !== 'Done') {
    actualFixDate = new Date();
  } else if (status !== 'Done' && existing.status === 'Done') {
    actualFixDate = null;
  }

  await prisma.backlogItem.update({
    where: { id: req.params.id },
    data: { title, description, category, priority, status, actualFixDate },
  });
  res.redirect(`/api/admin/backlog/${req.params.id}`);
});
