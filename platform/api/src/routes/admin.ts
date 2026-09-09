import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { prisma } from '../db/client.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { createSession, destroySession } from '../auth/session.js';
import { env } from '../env.js';
import { requirePlatformAdminAuth } from '../middleware/requirePlatformAdminAuth.js';
import { adminPage, escapeHtml } from '../lib/adminHtml.js';

export const adminRouter = Router();

// Highest-value login target in the whole app — a compromised admin
// account reaches every tenant's data. Same shape as auth.ts's own
// loginLimiter.
const adminLoginLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
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

  res.type('html').send(adminPage(tenant.businessName, `
    ${editForm}
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
