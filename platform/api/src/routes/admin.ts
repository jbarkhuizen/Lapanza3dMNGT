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
      <li><a href="/api/admin/backlog">Backlog</a></li>
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
  // The grant and adjust/cancel forms are independent, non-exclusive
  // conditions per the design spec — NOT an if/else. A 'canceled' or
  // 'lapsed' row still exists (has a real row, possibly still a live
  // providerSubscriptionId at the real payment provider), so it must show
  // BOTH: adjust/cancel (to recover or clean up the existing row) and grant
  // (to hand the tenant a fresh comped subscription instead). Only a
  // genuinely absent subscription shows grant alone.
  const showGrantForm = !sub || sub.status === 'canceled' || sub.status === 'lapsed';
  const showAdjustForm = Boolean(sub);

  let subscriptionSection = '<div class="card"><h2>Subscription</h2>';
  if (sub) {
    subscriptionSection += `
      <p>${escapeHtml(sub.plan.name)} &mdash; status <strong>${escapeHtml(sub.status)}</strong>,
      trial ends ${sub.trialEndsAt.toISOString().slice(0, 10)},
      period ends ${sub.currentPeriodEnd ? sub.currentPeriodEnd.toISOString().slice(0, 10) : '&mdash;'}</p>`;
  } else {
    subscriptionSection += '<p>No subscription.</p>';
  }

  if (showGrantForm) {
    const plans = await prisma.plan.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } });
    const planOptions = plans.map((p) => `<option value="${p.id}">${escapeHtml(p.name)} (R${p.monthlyPrice.toFixed(2)})</option>`).join('');
    subscriptionSection += `
      <form method="post" action="/api/admin/tenants/${tenant.id}/subscription/grant">
        <label>Grant plan<br />
          <select name="planId" required>${planOptions}</select>
        </label>
        <button type="submit">Grant subscription</button>
      </form>`;
  }

  if (showAdjustForm && sub) {
    const statusOptions = ['trialing', 'active', 'past_due', 'lapsed', 'canceled']
      .map((s) => `<option value="${s}" ${s === sub.status ? 'selected' : ''}>${s}</option>`)
      .join('');
    subscriptionSection += `
      <form method="post" action="/api/admin/tenants/${tenant.id}/subscription/adjust" style="margin-top:12px">
        <label>Status<br />
          <select name="status">${statusOptions}</select>
        </label>
        <label>Extend period end to<br /><input type="date" name="currentPeriodEnd" /></label>
        <button type="submit">Save</button>
      </form>
      <form method="post" action="/api/admin/tenants/${tenant.id}/subscription/cancel" style="margin-top:12px">
        <button type="submit">Cancel subscription</button>
      </form>`;
  }
  subscriptionSection += '</div>';

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
    // but never override an intentionally-supplied one.
    if (status === 'active' && !explicitPeriodEnd) {
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
      <table>
        <thead><tr><th>Number</th><th>Customer</th><th>Status</th><th>Total</th><th>Date</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5">No quotes.</td></tr>'}</tbody>
      </table>
    `));
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
      <table>
        <thead><tr><th>Number</th><th>Customer</th><th>Status</th><th>Total</th><th>Paid</th><th>Date</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="6">No invoices.</td></tr>'}</tbody>
      </table>
    `));
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
        <form method="post" action="/api/admin/plans/${p.id}/edit" class="inline">
          <input name="name" value="${escapeHtml(p.name)}" style="width:120px" required />
          <input name="monthlyPrice" value="${p.monthlyPrice.toFixed(2)}" style="width:80px" required />
          <input name="sortOrder" type="number" value="${p.sortOrder}" style="width:60px" required />
          <label><input type="checkbox" name="active" ${p.active ? 'checked' : ''} /> Active</label>
          <button type="submit">Save</button>
        </form>
      </td>
    </tr>`).join('');
  res.type('html').send(adminPage('Plans', `
    <table><tbody>${rows}</tbody></table>
    <div class="card">
      <h2>New plan</h2>
      <form method="post" action="/api/admin/plans">
        <label>Name<br /><input name="name" required /></label><br /><br />
        <label>Monthly price (R)<br /><input name="monthlyPrice" required /></label><br /><br />
        <label>Sort order<br /><input name="sortOrder" type="number" required /></label><br /><br />
        <button type="submit">Create plan</button>
      </form>
    </div>
  `));
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
      <td><a href="/api/admin/backlog/${item.id}">${escapeHtml(item.title)}</a><br /><span style="color:#6a5f54;font-size:13px">${escapeHtml(truncate(item.description, 140))}</span></td>
      <td>${escapeHtml(item.category)}</td>
      <td>${badge(item.priority)}</td>
      <td>${badge(item.status)}</td>
    </tr>`).join('');

  const filterLink = (value: string, label: string) => `<a href="/api/admin/backlog?status=${encodeURIComponent(value)}" ${statusFilter === value ? 'aria-current="page"' : ''}>${label}</a>`;

  res.type('html').send(adminPage('Backlog', `
    <p>${filterLink('Backlog', 'Open')} &middot; ${filterLink('Done', 'Done')} &middot; ${filterLink('all', 'All')}</p>
    <table>
      <thead><tr><th>#</th><th>Item</th><th>Category</th><th>Priority</th><th>Status</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5">No items.</td></tr>'}</tbody>
    </table>
    <div class="card">
      <h2>New backlog item</h2>
      <form method="post" action="/api/admin/backlog">
        <label>Title<br /><input name="title" required style="width:100%" /></label><br /><br />
        <label>Description<br /><textarea name="description" rows="4" required></textarea></label><br /><br />
        <label>Category<br />
          <select name="category">${BACKLOG_CATEGORIES.map((c) => `<option value="${c}">${c}</option>`).join('')}</select>
        </label>
        <label>Priority<br />
          <select name="priority">${BACKLOG_PRIORITIES.map((p) => `<option value="${p}" ${p === 'Medium' ? 'selected' : ''}>${p}</option>`).join('')}</select>
        </label>
        <br /><br />
        <button type="submit">Create item</button>
      </form>
    </div>
  `));
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
    <div class="card" style="max-width:720px">
      <form method="post" action="/api/admin/backlog/${item.id}/edit">
        <label>Title<br /><input name="title" value="${escapeHtml(item.title)}" required style="width:100%" /></label><br /><br />
        <label>Description<br /><textarea name="description" rows="10" required>${escapeHtml(item.description)}</textarea></label><br /><br />
        <label>Category<br />
          <select name="category">${BACKLOG_CATEGORIES.map((c) => `<option value="${c}" ${c === item.category ? 'selected' : ''}>${c}</option>`).join('')}</select>
        </label>
        <label>Priority<br />
          <select name="priority">${BACKLOG_PRIORITIES.map((p) => `<option value="${p}" ${p === item.priority ? 'selected' : ''}>${p}</option>`).join('')}</select>
        </label>
        <label>Status<br />
          <select name="status">${BACKLOG_STATUSES.map((s) => `<option value="${s}" ${s === item.status ? 'selected' : ''}>${s}</option>`).join('')}</select>
        </label>
        <br /><br />
        <p style="color:#6a5f54;font-size:13px">Added ${item.dateAdded.toISOString().slice(0, 10)}${item.actualFixDate ? ` &middot; Fixed ${item.actualFixDate.toISOString().slice(0, 10)}` : ''}</p>
        <button type="submit">Save</button>
      </form>
    </div>
  `));
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
