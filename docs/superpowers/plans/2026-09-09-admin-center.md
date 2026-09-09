# Admin Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A real admin center for Barkie's single trusted operator — server-
rendered pages inside `platform/api` at `/api/admin/...`, using the
`PlatformAdmin` model and `Session.subjectType = 'platform_admin'` that have
existed unused since the very first migration.

**Architecture:** One new router (`adminRouter`), mounted path-scoped at
`/api/admin` in `app.ts` — its own auth middleware can only ever apply to
`/api/admin/*` by construction, regardless of registration order relative to
other routers. Plain server-rendered HTML (template-literal strings,
`res.type('html').send(...)`), no client JS, no build step — this is the
first HTML-rendering code in `platform/api` (every existing route responds
JSON-only), so this plan establishes the convention from scratch with two
small shared helpers rather than adopting a framework. Cross-tenant by
design — every admin route uses `prisma` directly with an explicit
`tenantId`, never `tenantScope()` (which is built around one authenticated
tenant's own id, the wrong tool here — same reasoning `POST /api/quotes/:id/convert-to-invoice`
already established for genuinely cross-tenant code in this codebase).

**Tech Stack:** Existing `platform/api` stack only — Express 5, Prisma,
`bcryptjs`, `express-rate-limit`, `node:test` + `supertest`. No new
dependencies.

## Global Constraints

- **Never use `tenantScope()` in any admin route** — always `prisma`
  directly, with `tenantId` taken from `req.params.id` (an admin-chosen
  tenant), never from a session-derived tenant identity.
- **Escape every DB-sourced or user-controlled string before it reaches an
  HTML response** — reuse the shared `escapeHtml()` helper (Task 1) for
  every interpolated value. This is real XSS surface: admin pages display
  arbitrary tenant-supplied business names, emails, and (in later tasks)
  quote/invoice content.
- **Admin-granted subscriptions must be created with
  `paymentProvider: 'manual'` and `providerSubscriptionId: null`** —
  verified in the design spec against the current `billing.ts` cancel/
  resubscribe logic: both call sites that look up `providers[paymentProvider]`
  are already guarded behind `if (providerSubscriptionId)`, so a row with
  `providerSubscriptionId: null` never reaches that lookup, regardless of
  what string `paymentProvider` holds. Do not deviate from these two exact
  values for admin-granted rows.
- **Admin cancel must be fail-closed**, matching `POST /api/billing/cancel`'s
  own semantics exactly: call the real provider's `cancelSubscription`
  first (when `providerSubscriptionId` is set), let a rejection propagate
  (no swallowing try/catch), only flip local `status` to `'canceled'` after
  the provider call succeeds. Never let local cancel succeed while a real
  provider keeps charging.
- **Mount path is `/api/admin`, no nginx changes** — the existing
  `location /api/` proxy block already forwards the whole `/api/...` prefix
  to `platform/api` verbatim.
- **No client JavaScript anywhere in the admin pages** — plain HTML forms,
  GET links, POST-then-redirect (302) after every mutating action. This
  keeps every dynamic value server-rendered and escaped in one place,
  rather than needing the `document.createElement`/`.textContent` discipline
  `landing/`'s pages follow for client-side DOM building (irrelevant here —
  there is no client-side script to build DOM with).
- **First platform-admin account is created by a one-off script run
  directly on the server** (`npx tsx scripts/create-admin.ts <email>
  <password>`) — there must never be an HTTP-reachable route that creates a
  `PlatformAdmin` row.
- **Reuse existing auth primitives exactly**: `hashPassword`/`verifyPassword`
  from `src/auth/password.ts`, `createSession`/`destroySession`/`getSession`
  from `src/auth/session.ts`, the same session cookie (`env.sessionCookieName`)
  tenant auth uses, subject type literal `'platform_admin'` (already allowed
  by `createSession`'s type signature). No new env vars needed.

## File Structure

```
platform/api/src/middleware/requirePlatformAdminAuth.ts  — NEW: auth gate, mirrors requireTenantAuth.ts
platform/api/src/lib/adminHtml.ts                         — NEW: escapeHtml() + adminPage() page-wrapper helpers
platform/api/src/routes/admin.ts                          — NEW: all /api/admin/* routes
platform/api/src/routes/billing.ts                        — MODIFY: export the existing `providers` map (1-word change) so admin.ts can reuse it
platform/api/src/app.ts                                   — MODIFY: mount adminRouter
platform/api/scripts/create-admin.ts                       — NEW: one-off bootstrap script, never HTTP-reachable
platform/api/tests/admin.test.ts                           — NEW
docs/AI_HANDOFF.md                                          — MODIFY: document the admin center + bootstrap command
```

---

### Task 1: Auth foundation — middleware, login/logout, HTML helpers, bootstrap script

**Files:**
- Create: `platform/api/src/middleware/requirePlatformAdminAuth.ts`
- Create: `platform/api/src/lib/adminHtml.ts`
- Create: `platform/api/src/routes/admin.ts`
- Create: `platform/api/scripts/create-admin.ts`
- Modify: `platform/api/src/app.ts`
- Test: `platform/api/tests/admin.test.ts`

**Interfaces:**
- Produces: `requirePlatformAdminAuth` middleware, setting `req.platformAdminId`.
- Produces: `escapeHtml(value: string): string` and `adminPage(title: string, bodyHtml: string): string` from `adminHtml.ts` — every later task's route handlers import and use these.
- Produces: `adminRouter` (exported `Router` instance) — later tasks add more routes onto this same router in the same file.

- [ ] **Step 1: Write the failing tests**

Create `platform/api/tests/admin.test.ts`:

```typescript
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/db/client.js';
import { hashPassword } from '../src/auth/password.js';
import { resetTestDatabase } from './helpers/testApp.js';

const app = buildApp();

beforeEach(resetTestDatabase);

async function makeAdmin(email = 'admin@barkie.co.za', password = 'correct horse battery staple') {
  const passwordHash = await hashPassword(password);
  return prisma.platformAdmin.create({ data: { email, passwordHash } });
}

async function loggedInAdminAgent(email = 'admin@barkie.co.za', password = 'correct horse battery staple') {
  await makeAdmin(email, password);
  const agent = request.agent(app);
  await agent.post('/api/admin/login').send({ email, password });
  return agent;
}

test('GET /api/admin without a session redirects to login', async () => {
  const res = await request(app).get('/api/admin');
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, '/api/admin/login');
});

test('GET /api/admin/login renders without requiring auth', async () => {
  const res = await request(app).get('/api/admin/login');
  assert.equal(res.status, 200);
  assert.match(res.text, /Barkie Admin/);
});

test('POST /api/admin/login with wrong password redirects back with an error, does not set a session', async () => {
  await makeAdmin();
  const res = await request(app).post('/api/admin/login').send({ email: 'admin@barkie.co.za', password: 'wrong' });
  assert.equal(res.status, 302);
  assert.match(res.headers.location, /\/api\/admin\/login\?error=1/);
  assert.equal(res.headers['set-cookie'], undefined);
});

test('POST /api/admin/login with correct credentials sets a session and grants access', async () => {
  const agent = await loggedInAdminAgent();
  const res = await agent.get('/api/admin');
  assert.equal(res.status, 200);
  assert.match(res.text, /Dashboard/);
});

test('a tenant session cannot access /api/admin routes', async () => {
  const passwordHash = await hashPassword('irrelevant password value');
  await prisma.tenant.create({
    data: {
      businessName: 'Acme', contactName: 'Jane', email: 'jane@acmeprints.co.za',
      passwordHash, emailVerifiedAt: new Date(),
    },
  });
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: 'jane@acmeprints.co.za', password: 'irrelevant password value' });
  const res = await agent.get('/api/admin');
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, '/api/admin/login');
});

test('POST /api/admin/logout destroys the session', async () => {
  const agent = await loggedInAdminAgent();
  await agent.post('/api/admin/logout');
  const res = await agent.get('/api/admin');
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, '/api/admin/login');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd platform/api && npm test`
Expected: FAIL — `Cannot find module '../src/app.js'` referencing routes that don't exist yet, or the specific admin tests fail with 404s (since neither `adminRouter` nor its mount exist yet — the rest of the suite should still pass).

- [ ] **Step 3: Create the shared HTML helpers**

Create `platform/api/src/lib/adminHtml.ts`:

```typescript
export function escapeHtml(value: string): string {
  return String(value).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ));
}

// Every admin page except the login screen shares this wrapper — one
// place for the nav bar, the shared stylesheet, and the escaped title.
// bodyHtml is the caller's own already-escaped-per-value HTML fragment,
// never a raw user-controlled string on its own.
export function adminPage(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)} — Barkie Admin</title>
<style>
  body { font-family: ui-sans-serif, system-ui, sans-serif; background: #f7f3eb; color: #1a1612; margin: 0; padding: 32px; }
  h1 { font-size: 22px; margin: 0 0 20px; }
  h2 { font-size: 16px; margin: 0 0 12px; }
  nav { border-bottom: 2px solid #1a1612; padding-bottom: 16px; margin-bottom: 24px; }
  nav a { margin-right: 16px; color: #c24b28; text-decoration: none; font-weight: 600; }
  table { border-collapse: collapse; width: 100%; margin-top: 16px; }
  th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #e0d8c8; font-size: 14px; }
  th { text-transform: uppercase; font-size: 11px; letter-spacing: 0.05em; color: #3b322b; }
  form.inline { display: inline-flex; gap: 8px; align-items: center; }
  input, select { font-family: inherit; font-size: 14px; padding: 6px 8px; border: 1px solid #cbbfa8; border-radius: 4px; }
  button { font-family: inherit; font-size: 14px; padding: 6px 14px; border: none; border-radius: 4px; background: #c24b28; color: #fff; cursor: pointer; }
  .card { background: #efe7d8; border: 1px solid #e0d8c8; border-radius: 8px; padding: 20px; margin-bottom: 20px; max-width: 640px; }
  .error { color: #c24b28; font-weight: 600; }
  .logout-form { float: right; }
</style>
</head>
<body>
<nav>
  <a href="/api/admin">Dashboard</a>
  <a href="/api/admin/tenants">Tenants</a>
  <a href="/api/admin/plans">Plans</a>
  <a href="https://barkie.co.za/admin/signups" target="_blank" rel="noopener">Launch signups &#8599;</a>
  <form class="logout-form" method="post" action="/api/admin/logout"><button type="submit">Log out</button></form>
</nav>
<h1>${escapeHtml(title)}</h1>
${bodyHtml}
</body>
</html>`;
}
```

- [ ] **Step 4: Create the auth middleware**

Create `platform/api/src/middleware/requirePlatformAdminAuth.ts`:

```typescript
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
```

- [ ] **Step 5: Create the admin router with login/logout/dashboard**

Create `platform/api/src/routes/admin.ts`:

```typescript
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

adminRouter.get('/api/admin/login', (req, res) => {
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

adminRouter.post('/api/admin/login', adminLoginLimiter, async (req, res) => {
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

adminRouter.post('/api/admin/logout', requirePlatformAdminAuth, async (req, res) => {
  const token = req.cookies?.[env.sessionCookieName];
  if (token) {
    await destroySession(token);
  }
  res.clearCookie(env.sessionCookieName);
  res.redirect('/api/admin/login');
});

adminRouter.get('/api/admin', requirePlatformAdminAuth, (_req, res) => {
  res.type('html').send(adminPage('Dashboard', `
    <ul>
      <li><a href="/api/admin/tenants">Tenants</a></li>
      <li><a href="/api/admin/plans">Plans</a></li>
    </ul>
  `));
});
```

(`escapeHtml` is imported here even though this step doesn't use it yet —
every later task in this same file will; keep the import.)

- [ ] **Step 6: Mount the router**

In `platform/api/src/app.ts`, add the import near the other route imports:

```typescript
import { adminRouter } from './routes/admin.js';
```

Mount it path-scoped, anywhere after `express.urlencoded()`/`cookieParser()`
are registered (both already are, globally, near the top of `buildApp()`)
and after `healthRouter`/`publicRouter` — exact position relative to the
other routers doesn't matter for correctness (unlike `webhooksRouter`/
`billingRouter`'s unpathed mounts elsewhere in this file), specifically
*because* this mount is path-scoped:

```typescript
  app.use('/api/admin', adminRouter);
```

Add a one-line comment explaining why this one's exempt from the mount-order
discipline the other comments in this file describe:

```typescript
  // Path-scoped (unlike the routers below) — adminRouter's own auth
  // middleware can only ever apply to /api/admin/* requests, regardless
  // of where this line sits relative to the other app.use() calls. This
  // is the structural fix past whole-branch reviews recommended for the
  // "unpathed router.use() intercepts everything mounted after it" bug
  // class this codebase has hit three times.
  app.use('/api/admin', adminRouter);
```

- [ ] **Step 7: Create the bootstrap script**

Create `platform/api/scripts/create-admin.ts`:

```typescript
import { prisma } from '../src/db/client.js';
import { hashPassword } from '../src/auth/password.js';

async function main() {
  const [, , email, password] = process.argv;
  if (!email || !password) {
    console.error('Usage: npx tsx scripts/create-admin.ts <email> <password>');
    process.exitCode = 1;
    return;
  }

  const existing = await prisma.platformAdmin.findUnique({ where: { email } });
  if (existing) {
    console.error(`A platform admin with email ${email} already exists.`);
    process.exitCode = 1;
    return;
  }

  const passwordHash = await hashPassword(password);
  const admin = await prisma.platformAdmin.create({ data: { email, passwordHash } });
  console.log(`Created platform admin ${admin.email} (id ${admin.id}).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd platform/api && npm test`
Expected: PASS (all 6 new tests, plus the full existing suite still green).

- [ ] **Step 9: Typecheck**

Run: `cd platform/api && npm run typecheck`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
cd platform/api
git add src/middleware/requirePlatformAdminAuth.ts src/lib/adminHtml.ts src/routes/admin.ts src/app.ts scripts/create-admin.ts tests/admin.test.ts
git commit -m "Add admin center auth foundation: login/logout, session gate, bootstrap script"
```

---

### Task 2: Tenant list and tenant detail (view + edit)

**Files:**
- Modify: `platform/api/src/routes/admin.ts`
- Modify: `platform/api/tests/admin.test.ts`

**Interfaces:**
- Consumes: `adminPage`/`escapeHtml` (Task 1), `requirePlatformAdminAuth` (Task 1).
- Produces: `GET /api/admin/tenants`, `GET /api/admin/tenants/:id`, `POST /api/admin/tenants/:id/edit` — Task 3 (subscription actions) and Task 4 (quotes/invoices links) render onto the same tenant-detail page this task builds.

- [ ] **Step 1: Write the failing tests**

Append to `platform/api/tests/admin.test.ts`:

```typescript
test('GET /api/admin/tenants lists tenants with subscription status', async () => {
  const passwordHash = await hashPassword('irrelevant password value');
  await prisma.tenant.create({
    data: { businessName: 'Acme Prints', contactName: 'Jane', email: 'jane@acmeprints.co.za', passwordHash },
  });
  const agent = await loggedInAdminAgent();
  const res = await agent.get('/api/admin/tenants');
  assert.equal(res.status, 200);
  assert.match(res.text, /Acme Prints/);
  assert.match(res.text, /jane@acmeprints\.co\.za/);
  assert.match(res.text, /None/); // no subscription yet
});

test('GET /api/admin/tenants/:id shows tenant detail with an edit form pre-filled', async () => {
  const passwordHash = await hashPassword('irrelevant password value');
  const tenant = await prisma.tenant.create({
    data: { businessName: 'Acme Prints', contactName: 'Jane Doe', email: 'jane@acmeprints.co.za', passwordHash },
  });
  const agent = await loggedInAdminAgent();
  const res = await agent.get(`/api/admin/tenants/${tenant.id}`);
  assert.equal(res.status, 200);
  assert.match(res.text, /value="Acme Prints"/);
  assert.match(res.text, /value="Jane Doe"/);
  assert.match(res.text, /value="jane@acmeprints\.co\.za"/);
});

test('GET /api/admin/tenants/:id 404s for an unknown id', async () => {
  const agent = await loggedInAdminAgent();
  const res = await agent.get('/api/admin/tenants/does-not-exist');
  assert.equal(res.status, 404);
});

test('POST /api/admin/tenants/:id/edit updates exactly that tenant, not others', async () => {
  const passwordHash = await hashPassword('irrelevant password value');
  const tenantA = await prisma.tenant.create({
    data: { businessName: 'Acme Prints', contactName: 'Jane', email: 'jane@acmeprints.co.za', passwordHash },
  });
  const tenantB = await prisma.tenant.create({
    data: { businessName: 'Other Co', contactName: 'Bob', email: 'bob@other.co.za', passwordHash },
  });
  const agent = await loggedInAdminAgent();
  const res = await agent.post(`/api/admin/tenants/${tenantA.id}/edit`).send({
    businessName: 'Acme 3D Prints', contactName: 'Jane Smith', email: 'jane.smith@acmeprints.co.za',
  });
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, `/api/admin/tenants/${tenantA.id}`);

  const updatedA = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantA.id } });
  assert.equal(updatedA.businessName, 'Acme 3D Prints');
  assert.equal(updatedA.contactName, 'Jane Smith');
  assert.equal(updatedA.email, 'jane.smith@acmeprints.co.za');

  const untouchedB = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantB.id } });
  assert.equal(untouchedB.businessName, 'Other Co');
});

test('admin tenant routes require a platform-admin session', async () => {
  const res1 = await request(app).get('/api/admin/tenants');
  assert.equal(res1.status, 302);
  const res2 = await request(app).post('/api/admin/tenants/some-id/edit').send({ businessName: 'x' });
  assert.equal(res2.status, 302);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd platform/api && npm test`
Expected: FAIL — 404s for the new routes.

- [ ] **Step 3: Add the tenant list and detail routes**

Append to `platform/api/src/routes/admin.ts`:

```typescript
adminRouter.get('/api/admin/tenants', requirePlatformAdminAuth, async (_req, res) => {
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

adminRouter.get('/api/admin/tenants/:id', requirePlatformAdminAuth, async (req, res) => {
  const tenant = await prisma.tenant.findUnique({
    where: { id: req.params.id },
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

adminRouter.post('/api/admin/tenants/:id/edit', requirePlatformAdminAuth, async (req, res) => {
  const { businessName, contactName, email } = (req.body ?? {}) as Record<string, unknown>;
  if (typeof businessName !== 'string' || typeof contactName !== 'string' || typeof email !== 'string') {
    return res.redirect(`/api/admin/tenants/${req.params.id}`);
  }
  await prisma.tenant.update({
    where: { id: req.params.id },
    data: { businessName, contactName, email },
  });
  res.redirect(`/api/admin/tenants/${req.params.id}`);
});
```

(Task 3 will insert a subscription section into the tenant-detail body,
between `editForm` and the quotes/invoices links — expect to edit this
handler again in Task 3, not just append after it.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd platform/api && npm test`
Expected: PASS

- [ ] **Step 5: Typecheck**

Run: `cd platform/api && npm run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd platform/api
git add src/routes/admin.ts tests/admin.test.ts
git commit -m "Add admin tenant list and detail/edit pages"
```

---

### Task 3: Subscription management (grant / adjust / cancel)

**Files:**
- Modify: `platform/api/src/routes/admin.ts`
- Modify: `platform/api/src/routes/billing.ts`
- Modify: `platform/api/tests/admin.test.ts`

**Interfaces:**
- Consumes: `providers` — newly exported from `billing.ts` (was a local `const`).
- Produces: `POST /api/admin/tenants/:id/subscription/grant`, `.../adjust`, `.../cancel`.

- [ ] **Step 1: Export `providers` from billing.ts**

In `platform/api/src/routes/billing.ts`, find:

```typescript
const providers: Record<string, PaymentProvider> = {
```

Change to:

```typescript
export const providers: Record<string, PaymentProvider> = {
```

No other change to this file in this task.

- [ ] **Step 2: Write the failing tests**

Append to `platform/api/tests/admin.test.ts`:

```typescript
async function makeTenantAndPlan() {
  const passwordHash = await hashPassword('irrelevant password value');
  const tenant = await prisma.tenant.create({
    data: { businessName: 'Acme Prints', contactName: 'Jane', email: 'jane@acmeprints.co.za', passwordHash },
  });
  const plan = await prisma.plan.findFirstOrThrow({ where: { name: 'Tier 1' } });
  return { tenant, plan };
}

test('granting a subscription creates one with paymentProvider "manual" and no providerSubscriptionId', async () => {
  const { tenant, plan } = await makeTenantAndPlan();
  const agent = await loggedInAdminAgent();
  const res = await agent.post(`/api/admin/tenants/${tenant.id}/subscription/grant`).send({ planId: plan.id });
  assert.equal(res.status, 302);

  const subscription = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } });
  assert.equal(subscription.status, 'active');
  assert.equal(subscription.paymentProvider, 'manual');
  assert.equal(subscription.providerSubscriptionId, null);
  assert.equal(subscription.planId, plan.id);
});

test('a granted subscription can be cancelled through the real tenant-facing cancel route with no error', async () => {
  // This is the direct regression test for this task's core safety claim:
  // an admin-granted row (paymentProvider: 'manual', providerSubscriptionId: null)
  // must never reach billing.ts's unguarded providers[paymentProvider] lookup.
  const { tenant, plan } = await makeTenantAndPlan();
  const adminAgent = await loggedInAdminAgent();
  await adminAgent.post(`/api/admin/tenants/${tenant.id}/subscription/grant`).send({ planId: plan.id });

  const tenantAgent = request.agent(app);
  await tenantAgent.post('/api/auth/register').send({
    businessName: tenant.businessName, contactName: 'Jane', email: tenant.email, password: 'correct horse battery staple',
  }).catch(() => {}); // tenant already exists from makeTenantAndPlan — register will 409, that's fine, we just need a logged-in agent
  const dbTenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
  await prisma.tenant.update({ where: { id: tenant.id }, data: { emailVerifiedAt: new Date() } });
  await tenantAgent.post('/api/auth/login').send({ email: dbTenant.email, password: 'irrelevant password value' });

  const res = await tenantAgent.post('/api/billing/cancel');
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);

  const cancelled = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } });
  assert.equal(cancelled.status, 'canceled');
});

test('re-granting replaces an existing canceled subscription rather than erroring', async () => {
  const { tenant, plan } = await makeTenantAndPlan();
  const agent = await loggedInAdminAgent();
  await agent.post(`/api/admin/tenants/${tenant.id}/subscription/grant`).send({ planId: plan.id });
  const first = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } });

  const res = await agent.post(`/api/admin/tenants/${tenant.id}/subscription/grant`).send({ planId: plan.id });
  assert.equal(res.status, 302);

  const second = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } });
  assert.notEqual(second.id, first.id);
});

test('adjust changes only the requested status, leaves other fields untouched', async () => {
  const { tenant, plan } = await makeTenantAndPlan();
  const agent = await loggedInAdminAgent();
  await agent.post(`/api/admin/tenants/${tenant.id}/subscription/grant`).send({ planId: plan.id });
  const before = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } });

  const res = await agent.post(`/api/admin/tenants/${tenant.id}/subscription/adjust`).send({ status: 'past_due' });
  assert.equal(res.status, 302);

  const after = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } });
  assert.equal(after.status, 'past_due');
  assert.equal(after.planId, before.planId);
  assert.equal(after.paymentProvider, before.paymentProvider);
});

test('adjust with an invalid status value is rejected, no change made', async () => {
  const { tenant, plan } = await makeTenantAndPlan();
  const agent = await loggedInAdminAgent();
  await agent.post(`/api/admin/tenants/${tenant.id}/subscription/grant`).send({ planId: plan.id });

  await agent.post(`/api/admin/tenants/${tenant.id}/subscription/adjust`).send({ status: 'not-a-real-status' });

  const unchanged = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } });
  assert.equal(unchanged.status, 'active');
});

test('cancel on a subscription with no providerSubscriptionId cancels locally with no provider call', async () => {
  const { tenant, plan } = await makeTenantAndPlan();
  const agent = await loggedInAdminAgent();
  await agent.post(`/api/admin/tenants/${tenant.id}/subscription/grant`).send({ planId: plan.id });

  const res = await agent.post(`/api/admin/tenants/${tenant.id}/subscription/cancel`);
  assert.equal(res.status, 302);

  const cancelled = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } });
  assert.equal(cancelled.status, 'canceled');
});
```

- [ ] **Step 3: Extend the tenant-detail handler with a subscription section**

In `platform/api/src/routes/admin.ts`, replace the `GET /api/admin/tenants/:id`
handler (from Task 2) with this version — it needs the list of active plans
for the grant form, and branches its subscription UI on whether one exists:

```typescript
adminRouter.get('/api/admin/tenants/:id', requirePlatformAdminAuth, async (req, res) => {
  const tenant = await prisma.tenant.findUnique({
    where: { id: req.params.id },
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
```

- [ ] **Step 4: Add the subscription action routes**

Append to `platform/api/src/routes/admin.ts` — add the import at the top of
the file first:

```typescript
import { providers } from './billing.js';
```

Then the three routes:

```typescript
adminRouter.post('/api/admin/tenants/:id/subscription/grant', requirePlatformAdminAuth, async (req, res) => {
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
});

const VALID_SUBSCRIPTION_STATUSES = ['trialing', 'active', 'past_due', 'lapsed', 'canceled'];

adminRouter.post('/api/admin/tenants/:id/subscription/adjust', requirePlatformAdminAuth, async (req, res) => {
  const tenantId = req.params.id;
  const { status, currentPeriodEnd } = (req.body ?? {}) as Record<string, unknown>;
  if (typeof status !== 'string' || !VALID_SUBSCRIPTION_STATUSES.includes(status)) {
    return res.redirect(`/api/admin/tenants/${tenantId}`);
  }

  const data: { status: string; currentPeriodEnd?: Date } = { status };
  if (typeof currentPeriodEnd === 'string' && currentPeriodEnd.trim() !== '') {
    const parsed = new Date(currentPeriodEnd);
    if (!Number.isNaN(parsed.getTime())) {
      data.currentPeriodEnd = parsed;
    }
  }

  await prisma.subscription.update({ where: { tenantId }, data });
  res.redirect(`/api/admin/tenants/${tenantId}`);
});

adminRouter.post('/api/admin/tenants/:id/subscription/cancel', requirePlatformAdminAuth, async (req, res) => {
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
});
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd platform/api && npm test`
Expected: PASS

- [ ] **Step 6: Typecheck**

Run: `cd platform/api && npm run typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
cd platform/api
git add src/routes/admin.ts src/routes/billing.ts tests/admin.test.ts
git commit -m "Add admin subscription grant/adjust/cancel, proven safe against billing.ts's provider lookup"
```

---

### Task 4: Read-only tenant quotes/invoices views

**Files:**
- Modify: `platform/api/src/routes/admin.ts`
- Modify: `platform/api/tests/admin.test.ts`

**Interfaces:** none new — pure additions consuming existing `Quote`/`Invoice`/`Customer` models directly via `prisma`.

- [ ] **Step 1: Write the failing tests**

Append to `platform/api/tests/admin.test.ts`:

```typescript
async function makeTenantWithCustomerAndQuote() {
  const passwordHash = await hashPassword('irrelevant password value');
  const tenant = await prisma.tenant.create({
    data: { businessName: 'Acme Prints', contactName: 'Jane', email: 'jane@acmeprints.co.za', passwordHash },
  });
  const customer = await prisma.customer.create({
    data: { tenantId: tenant.id, name: 'Bob Buyer', billingAddress: '1 Main St' },
  });
  const quote = await prisma.quote.create({
    data: {
      tenantId: tenant.id, number: 'QT-0001', customerId: customer.id,
      vatApplied: false, subtotal: '100.00', vatAmount: '0.00', total: '100.00',
    },
  });
  return { tenant, customer, quote };
}

test('GET /api/admin/tenants/:id/quotes lists that tenant\'s quotes only', async () => {
  const { tenant, quote } = await makeTenantWithCustomerAndQuote();
  const passwordHash = await hashPassword('irrelevant password value');
  const otherTenant = await prisma.tenant.create({
    data: { businessName: 'Other Co', contactName: 'Bob', email: 'bob@other.co.za', passwordHash },
  });
  const otherCustomer = await prisma.customer.create({
    data: { tenantId: otherTenant.id, name: 'Someone Else', billingAddress: '2 Other St' },
  });
  await prisma.quote.create({
    data: {
      tenantId: otherTenant.id, number: 'QT-0001', customerId: otherCustomer.id,
      vatApplied: false, subtotal: '999.00', vatAmount: '0.00', total: '999.00',
    },
  });

  const agent = await loggedInAdminAgent();
  const res = await agent.get(`/api/admin/tenants/${tenant.id}/quotes`);
  assert.equal(res.status, 200);
  assert.match(res.text, /QT-0001/);
  assert.match(res.text, /Bob Buyer/);
  assert.ok(!res.text.includes('999.00'), 'must not show the other tenant\'s quote');
});

test('GET /api/admin/tenants/:id/invoices lists that tenant\'s invoices only', async () => {
  const { tenant, customer } = await makeTenantWithCustomerAndQuote();
  await prisma.invoice.create({
    data: {
      tenantId: tenant.id, number: 'INV-0001', customerId: customer.id, dueDate: new Date(),
      vatApplied: false, subtotal: '100.00', vatAmount: '0.00', total: '100.00', amountPaid: '0.00',
    },
  });

  const agent = await loggedInAdminAgent();
  const res = await agent.get(`/api/admin/tenants/${tenant.id}/invoices`);
  assert.equal(res.status, 200);
  assert.match(res.text, /INV-0001/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd platform/api && npm test`
Expected: FAIL — 404s for the two new routes.

- [ ] **Step 3: Add the routes**

Append to `platform/api/src/routes/admin.ts`:

```typescript
adminRouter.get('/api/admin/tenants/:id/quotes', requirePlatformAdminAuth, async (req, res) => {
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
});

adminRouter.get('/api/admin/tenants/:id/invoices', requirePlatformAdminAuth, async (req, res) => {
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
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd platform/api && npm test`
Expected: PASS

- [ ] **Step 5: Typecheck**

Run: `cd platform/api && npm run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd platform/api
git add src/routes/admin.ts tests/admin.test.ts
git commit -m "Add read-only admin views of a tenant's quotes and invoices"
```

---

### Task 5: Plan management (list, edit, create)

**Files:**
- Modify: `platform/api/src/routes/admin.ts`
- Modify: `platform/api/tests/admin.test.ts`

**Interfaces:** none new.

- [ ] **Step 1: Write the failing tests**

Append to `platform/api/tests/admin.test.ts`:

```typescript
test('GET /api/admin/plans lists the seeded plans', async () => {
  const agent = await loggedInAdminAgent();
  const res = await agent.get('/api/admin/plans');
  assert.equal(res.status, 200);
  assert.match(res.text, /Tier 1/);
  assert.match(res.text, /25\.00/);
});

test('POST /api/admin/plans creates a new plan', async () => {
  const agent = await loggedInAdminAgent();
  const res = await agent.post('/api/admin/plans').send({ name: 'Tier 4', monthlyPrice: '95.00', sortOrder: '4' });
  assert.equal(res.status, 302);

  const plan = await prisma.plan.findFirstOrThrow({ where: { name: 'Tier 4' } });
  assert.equal(plan.monthlyPrice.toFixed(2), '95.00');
  assert.equal(plan.sortOrder, 4);
  assert.equal(plan.active, true);
});

test('POST /api/admin/plans/:id/edit updates price, name, sortOrder, and active', async () => {
  const plan = await prisma.plan.findFirstOrThrow({ where: { name: 'Tier 1' } });
  const agent = await loggedInAdminAgent();
  const res = await agent.post(`/api/admin/plans/${plan.id}/edit`).send({
    name: 'Tier 1 (renamed)', monthlyPrice: '30.00', sortOrder: '1',
    // no 'active' key at all — matches an unchecked HTML checkbox, which
    // submits nothing for that field
  });
  assert.equal(res.status, 302);

  const updated = await prisma.plan.findUniqueOrThrow({ where: { id: plan.id } });
  assert.equal(updated.name, 'Tier 1 (renamed)');
  assert.equal(updated.monthlyPrice.toFixed(2), '30.00');
  assert.equal(updated.active, false, 'an unchecked checkbox must deactivate the plan');
});

test('POST /api/admin/plans/:id/edit with active="on" keeps the plan active', async () => {
  const plan = await prisma.plan.findFirstOrThrow({ where: { name: 'Tier 2' } });
  const agent = await loggedInAdminAgent();
  await agent.post(`/api/admin/plans/${plan.id}/edit`).send({
    name: 'Tier 2', monthlyPrice: '45.00', sortOrder: '2', active: 'on',
  });

  const updated = await prisma.plan.findUniqueOrThrow({ where: { id: plan.id } });
  assert.equal(updated.active, true);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd platform/api && npm test`
Expected: FAIL — 404s for the new routes.

- [ ] **Step 3: Add the plan routes**

Append to `platform/api/src/routes/admin.ts`:

```typescript
adminRouter.get('/api/admin/plans', requirePlatformAdminAuth, async (_req, res) => {
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

adminRouter.post('/api/admin/plans', requirePlatformAdminAuth, async (req, res) => {
  const { name, monthlyPrice, sortOrder } = (req.body ?? {}) as Record<string, unknown>;
  if (typeof name !== 'string' || typeof monthlyPrice !== 'string' || typeof sortOrder !== 'string') {
    return res.redirect('/api/admin/plans');
  }
  await prisma.plan.create({
    data: { name, monthlyPrice, sortOrder: Number(sortOrder) },
  });
  res.redirect('/api/admin/plans');
});

adminRouter.post('/api/admin/plans/:id/edit', requirePlatformAdminAuth, async (req, res) => {
  const { name, monthlyPrice, sortOrder, active } = (req.body ?? {}) as Record<string, unknown>;
  if (typeof name !== 'string' || typeof monthlyPrice !== 'string' || typeof sortOrder !== 'string') {
    return res.redirect('/api/admin/plans');
  }
  await prisma.plan.update({
    where: { id: req.params.id },
    data: { name, monthlyPrice, sortOrder: Number(sortOrder), active: active === 'on' },
  });
  res.redirect('/api/admin/plans');
});
```

(`Plan.monthlyPrice` is a Prisma `Decimal` column that accepts a plain
numeric string on create/update — matching the pattern `prisma/seed.ts`
already uses. `active === 'on'` correctly evaluates `false` when the
checkbox is unchecked, since an unchecked HTML checkbox submits no key at
all for that field, not an empty string.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd platform/api && npm test`
Expected: PASS

- [ ] **Step 5: Typecheck**

Run: `cd platform/api && npm run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd platform/api
git add src/routes/admin.ts tests/admin.test.ts
git commit -m "Add admin plan management: list, edit, create"
```

---

### Task 6: Integration polish + docs

**Files:**
- Modify: `docs/AI_HANDOFF.md`

**Interfaces:** none — documentation only.

- [ ] **Step 1: Manual smoke test**

Run `cd platform/api && npm run dev` locally (or however this project's dev
server is normally started — check `package.json`'s `dev` script). Bootstrap
a local admin account: `npx tsx scripts/create-admin.ts you@example.com
some-password`. Log in at `http://localhost:4200/api/admin/login`, and
click through: Tenants list → a tenant detail page → grant a subscription →
confirm it shows correctly → adjust its status → cancel it → Plans page →
edit a price → create a new plan. Confirm no console errors server-side,
every page renders, every form round-trips correctly.

- [ ] **Step 2: Update docs/AI_HANDOFF.md**

Add a new entry to the "Current state" table (matching the existing row
format) describing the admin center as live at `https://barkie.co.za/api/admin/`
once deployed — code-complete first, "deployed" only after the actual
deploy step (matching this project's established pattern of not claiming
"deployed" in docs until it genuinely has been). Document the bootstrap
command (`npx tsx scripts/create-admin.ts <email> <password>`, run once
directly on the VPS via SSH — never over HTTP) in the "Deploying" section,
right after the existing "Redeploying the API" block. Note in the same
place that `backlog #26` is now closed.

- [ ] **Step 3: Run the full suite one more time**

```bash
cd platform/api && npm test && npm run typecheck
```
Expected: all green — this task only touches documentation, so this is a
pure regression check.

- [ ] **Step 4: Commit**

```bash
git add docs/AI_HANDOFF.md
git commit -m "Document the admin center: bootstrap command, deploy notes, backlog #26 closed"
```

---

## After all tasks

Deploy `platform/api` (see `docs/AI_HANDOFF.md`'s "Deploying" section —
no nginx changes needed, the existing `/api/` proxy block already covers
`/api/admin/...`), then:
1. SSH to the VPS and run the bootstrap script once:
   `cd /opt/barkie/api && npx tsx scripts/create-admin.ts <real email> <real password>`.
2. Log in at `https://barkie.co.za/api/admin/login` with those credentials
   and smoke-test the same flow as Task 6 Step 1, against production data —
   view the real tenant list, confirm the real `Plan` rows show correctly,
   do NOT actually grant/cancel a real subscription or edit a real plan's
   price during this smoke test unless that's a change you actually want to
   make (this is real production data, not a sandbox).
