# Public Site (Home / Pricing / Materials Guide) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `landing/`'s single coming-soon page with the real public
site: Home (live stats), Pricing (live plan data), and a full interactive
Materials Guide (selector, browsable grid, head-to-head compare).

**Architecture:** Extend the existing `landing/` Express + static-file app
(no build step, no framework) with two more static HTML pages sharing one
CSS file and a small set of vanilla-JS modules. Two new unauthenticated
endpoints added to `platform/api` (`GET /api/public/stats`,
`GET /api/public/plans`) feed live data to `landing/` via same-origin
`fetch()` (nginx proxies both `/` and `/api/` under `barkie.co.za`, so no
CORS is needed). The Materials Guide's dataset is a static JSON module
with no backend involvement.

**Tech Stack:** `landing/`: Node/Express (existing), vanilla HTML/CSS/JS,
no build step, no new dependencies. `platform/api`: existing Express/
Prisma/zod stack, `node:test` for the two new endpoints.

## Global Constraints

- **Design tokens**: reuse `landing/public/styles.css`'s existing CSS
  custom properties exactly — `--color-cream`/`--color-linen`/
  `--color-charcoal`/`--color-espresso`/`--color-terracotta`/
  `--color-olive`/`--color-steel`, `--font-serif` (Fraunces),
  `--font-sans` (DM Sans), the existing `data-theme="dark"` override
  block, the `.btn`/`.btn--primary`/`.card` neubrutalist-shadow pattern.
  Do not introduce new colors or fonts.
- **No CORS handling needed** — `landing/` and `platform/api` are both
  proxied under `https://barkie.co.za` by nginx; a `fetch()` from a page
  served at `/` to `/api/public/...` is same-origin.
- **The two new public API routes must be mounted on their own router,
  with no auth middleware, registered in `app.ts` before any
  `requireTenantAuth`/`requireActiveSubscription`-gated router** — this
  codebase has hit the "unpathed `router.use()` on a router mounted at
  `/` intercepts every request that reaches it" bug three separate times
  (Tasks 4 and 5 of the billing/subscription plan). Do not attempt to
  carve an exception out of the existing `billingRouter` (which applies
  `requireTenantAuth` to everything via `billingRouter.use(...)`) — add a
  brand-new router instead, exactly like `webhooksRouter` already does.
- **Never build dynamic DOM content by assigning HTML strings to an
  element's markup property** — a repo-wide hook blocks any Write/Edit
  containing that pattern, even safely-escaped usage, and the project's
  own docs call this out explicitly. Every dynamic element in this plan
  is built with `document.createElement` / `.textContent` /
  `.appendChild` from the start; there is no step where a template
  string is assigned onto an element's markup.
- **Pricing must not hand-type numbers that live in the database** — the
  Pricing page's tier prices come from `GET /api/public/plans`, never
  hardcoded.
- **Materials Guide printer-setting data is authored from stable material
  science** (no per-item web verification needed); **`priceZarPerKg` is
  the one field that needs real-world grounding** — spot-check common
  materials against real South African retailer listings, mark anything
  unverified `estimated: true`. **Every food-contact claim must carry an
  explicit caveat** (brand additives, nozzle material, post-processing —
  not a flat "yes").
- **Stats are shown honestly, even when small** — no minimum-display
  threshold, no fabricated numbers.
- **Admin center, tier-differentiation/usage-limit enforcement, and
  wiring the Materials Guide into the costing engine are explicitly out
  of scope** for this plan.

## File Structure

```
platform/api/src/routes/public.ts          — NEW: GET /api/public/stats, GET /api/public/plans
platform/api/src/app.ts                    — MODIFY: mount publicRouter
platform/api/tests/public.test.ts          — NEW

landing/public/index.html                  — MODIFY: becomes the real Home page
landing/public/pricing.html                — NEW
landing/public/materials.html              — NEW
landing/public/styles.css                  — MODIFY: add nav/stats/pricing/materials styles
landing/public/js/shared.js                — NEW: theme toggle + footer year (extracted from main.js)
landing/public/js/home.js                  — NEW: stats fetch + render
landing/public/js/pricing.js               — NEW: plans fetch + render, FAQ accordion
landing/public/js/materials-data.js        — NEW: the 26-material dataset (ES module, exports MATERIALS)
landing/public/js/materials-selector.js    — NEW: pure filter/rank functions (no DOM) — the only part that gets automated tests
landing/public/js/materials.js             — NEW: DOM wiring for all 3 Materials Guide views, imports the above two
landing/public/main.js                     — MODIFY: keep only the notify-form logic (theme toggle moves to shared.js); notify form itself stays server-side/functional but is no longer linked from the new Home page nav (see Task 2)
landing/tests/materialsSelector.test.js    — NEW: node:test, pure-logic tests for materials-selector.js
landing/package.json                       — MODIFY: add a "test" script
landing/README.md                          — MODIFY: reflect the new pages
```

Nav/footer markup is duplicated across the 3 HTML files (not templated) —
3 static pages is small enough that duplication is simpler than building
an include mechanism for a no-build-step app, matching this app's
existing minimal-tooling philosophy.

---

### Task 1: Public API endpoints

**Files:**
- Create: `platform/api/src/routes/public.ts`
- Modify: `platform/api/src/app.ts`
- Test: `platform/api/tests/public.test.ts`

**Interfaces:**
- Produces: `GET /api/public/stats` → `{ ok: true, registeredBusinesses: number, activeSubscriptions: number }`
- Produces: `GET /api/public/plans` → `{ ok: true, plans: Array<{ id: string; name: string; monthlyPrice: string; sortOrder: number }> }`
- Both routes require no authentication and are reachable with no session cookie.

- [ ] **Step 1: Write the failing tests**

Create `platform/api/tests/public.test.ts`:

```typescript
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/db/client.js';
import { resetTestDatabase } from './helpers/testApp.js';

const app = buildApp();

beforeEach(resetTestDatabase);

test('GET /api/public/stats returns real counts with no auth', async () => {
  const tenant1 = await prisma.tenant.create({
    data: {
      businessName: 'Shop One',
      contactName: 'Owner One',
      email: 'shop-one@example.com',
      passwordHash: 'x',
      emailVerifiedAt: new Date(),
    },
  });
  await prisma.tenant.create({
    data: {
      businessName: 'Shop Two',
      contactName: 'Owner Two',
      email: 'shop-two@example.com',
      passwordHash: 'x',
      emailVerifiedAt: new Date(),
    },
  });

  const plan = await prisma.plan.create({
    data: { name: 'Tier 1', monthlyPrice: '25.00', sortOrder: 1 },
  });

  await prisma.subscription.create({
    data: {
      tenantId: tenant1.id,
      planId: plan.id,
      status: 'trialing',
      paymentProvider: 'payfast',
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
  });

  const res = await request(app).get('/api/public/stats');

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.registeredBusinesses, 2);
  // trialing counts as an active subscription; the second tenant has none
  assert.equal(res.body.activeSubscriptions, 1);
});

test('GET /api/public/stats does not count lapsed/canceled subscriptions as active', async () => {
  const tenant = await prisma.tenant.create({
    data: {
      businessName: 'Shop',
      contactName: 'Owner',
      email: 'shop@example.com',
      passwordHash: 'x',
      emailVerifiedAt: new Date(),
    },
  });
  const plan = await prisma.plan.create({
    data: { name: 'Tier 1', monthlyPrice: '25.00', sortOrder: 1 },
  });
  await prisma.subscription.create({
    data: {
      tenantId: tenant.id,
      planId: plan.id,
      status: 'lapsed',
      paymentProvider: 'payfast',
      trialEndsAt: new Date(),
    },
  });

  const res = await request(app).get('/api/public/stats');

  assert.equal(res.body.registeredBusinesses, 1);
  assert.equal(res.body.activeSubscriptions, 0);
});

test('GET /api/public/plans returns active plans sorted, with no auth', async () => {
  await prisma.plan.create({ data: { name: 'Tier 2', monthlyPrice: '45.00', sortOrder: 2 } });
  await prisma.plan.create({ data: { name: 'Tier 1', monthlyPrice: '25.00', sortOrder: 1 } });
  await prisma.plan.create({ data: { name: 'Retired', monthlyPrice: '10.00', sortOrder: 3, active: false } });

  const res = await request(app).get('/api/public/plans');

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.plans.length, 2);
  assert.equal(res.body.plans[0].name, 'Tier 1');
  assert.equal(res.body.plans[0].monthlyPrice, '25.00');
  assert.equal(res.body.plans[1].name, 'Tier 2');
});

test('public routes are reachable with no session cookie at all (no 401)', async () => {
  const statsRes = await request(app).get('/api/public/stats');
  const plansRes = await request(app).get('/api/public/plans');
  assert.notEqual(statsRes.status, 401);
  assert.notEqual(plansRes.status, 401);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd platform/api && npm test`
Expected: FAIL — `Cannot find module '../src/routes/public.js'` (or similar), since the route doesn't exist yet.

- [ ] **Step 3: Create the public router**

Create `platform/api/src/routes/public.ts`:

```typescript
import { Router } from 'express';
import { prisma } from '../db/client.js';

export const publicRouter = Router();

publicRouter.get('/api/public/stats', async (_req, res) => {
  const [registeredBusinesses, activeSubscriptions] = await Promise.all([
    prisma.tenant.count(),
    prisma.subscription.count({ where: { status: { in: ['active', 'trialing'] } } }),
  ]);
  res.json({ ok: true, registeredBusinesses, activeSubscriptions });
});

publicRouter.get('/api/public/plans', async (_req, res) => {
  const plans = await prisma.plan.findMany({
    where: { active: true },
    orderBy: { sortOrder: 'asc' },
  });
  res.json({
    ok: true,
    plans: plans.map((plan) => ({
      id: plan.id,
      name: plan.name,
      monthlyPrice: plan.monthlyPrice.toFixed(2),
      sortOrder: plan.sortOrder,
    })),
  });
});
```

- [ ] **Step 4: Mount the router before any auth-gated router**

In `platform/api/src/app.ts`, add the import near the other route imports:

```typescript
import { publicRouter } from './routes/public.js';
```

Mount it immediately after `app.use(healthRouter);` and before
`app.use(createAuthRouter());` — this router has no middleware at all, so
its exact position relative to the auth-gated routers only matters in
that it must come before them (any of them could, in principle, gain an
unpathed blanket `.use()` later, per this codebase's history — mounting
early avoids ever depending on that not happening):

```typescript
  app.use(healthRouter);
  app.use(publicRouter);
  app.use(createAuthRouter());
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd platform/api && npm test`
Expected: PASS (all 4 new tests, plus the full existing suite still green).

- [ ] **Step 6: Typecheck**

Run: `cd platform/api && npm run typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
cd platform/api
git add src/routes/public.ts src/app.ts tests/public.test.ts
git commit -m "Add public stats and plans API endpoints for the marketing site"
```

---

### Task 2: Home page

**Files:**
- Modify: `landing/public/index.html`
- Modify: `landing/public/styles.css`
- Create: `landing/public/js/shared.js`
- Create: `landing/public/js/home.js`
- Modify: `landing/public/main.js`

**Interfaces:**
- Consumes: `GET /api/public/stats` (Task 1) — `{ ok, registeredBusinesses, activeSubscriptions }`.
- Produces: a shared nav/footer markup+style pattern that Tasks 3 and 5 copy into `pricing.html`/`materials.html`.

- [ ] **Step 1: Extract the theme toggle into a shared script**

Create `landing/public/js/shared.js`:

```javascript
(function () {
  const root = document.documentElement;
  const stored = localStorage.getItem('barkie-theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const initial = stored || (prefersDark ? 'dark' : 'light');
  root.setAttribute('data-theme', initial);

  const toggle = document.getElementById('theme-toggle');
  if (toggle) {
    toggle.addEventListener('click', () => {
      const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try {
        localStorage.setItem('barkie-theme', next);
      } catch (err) {
        // storage unavailable — theme just won't persist
      }
    });
  }

  const yearEl = document.getElementById('year');
  if (yearEl) {
    yearEl.textContent = String(new Date().getFullYear());
  }
})();
```

- [ ] **Step 2: Remove the now-duplicated logic from main.js**

Edit `landing/public/main.js` — delete the theme-toggle block (lines 1-19
of the current file) and the `document.getElementById('year')...` line,
keeping only the notify-form submit handler (lines 21-64 of the current
file). The notify form and its `/api/notify` endpoint stay functional
server-side (no backend change) even though Step 4 below removes it from
the new Home page's main content — leave `main.js` and the endpoint
alone; only `index.html` changes what it links to.

- [ ] **Step 3: Add nav, stats-strip, and pricing/materials-link styles**

Append to `landing/public/styles.css`:

```css
.site-header__inner {
  flex-wrap: wrap;
  gap: 16px;
}

.site-nav {
  display: flex;
  align-items: center;
  gap: 24px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.site-nav a {
  color: var(--ink);
  text-decoration: none;
  font-weight: 500;
  font-size: 15px;
}

.site-nav a:hover,
.site-nav a[aria-current="page"] {
  color: var(--color-terracotta);
}

.site-header__actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.btn--ghost {
  background: transparent;
  color: var(--ink);
  box-shadow: none;
}

.btn--ghost:hover {
  background: var(--surface-soft);
}

.stats-strip {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 20px;
  padding: 0 24px 64px;
}

.stats-strip[hidden] {
  display: none;
}

.stat-tile {
  background: var(--surface-soft);
  border: 2px solid var(--ink);
  border-radius: 10px;
  padding: 24px;
  text-align: center;
  box-shadow: 7px 7px 0 0 var(--ink);
}

.stat-tile__value {
  font-family: var(--font-serif);
  font-size: clamp(28px, 4vw, 40px);
  font-weight: 700;
  line-height: 1;
  margin: 0 0 8px;
}

.stat-tile__label {
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 12px;
  font-weight: 700;
  color: var(--ink-muted);
  margin: 0;
}

@media (max-width: 700px) {
  .site-header__inner {
    justify-content: flex-start;
  }
  .site-nav {
    order: 3;
    width: 100%;
    flex-wrap: wrap;
    gap: 12px 20px;
  }
}
```

- [ ] **Step 4: Rewrite index.html as the real Home page**

Replace `landing/public/index.html` entirely:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Barkie — run your 3D print shop like a business</title>
  <meta name="description" content="Barkie is a platform for small 3D-printing businesses to manage customers, printers, filament, job costing, and quotes/invoices in one place." />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
  <header class="site-header">
    <div class="wrap site-header__inner">
      <span class="wordmark">Barkie</span>
      <nav aria-label="Primary">
        <ul class="site-nav">
          <li><a href="/" aria-current="page">Home</a></li>
          <li><a href="/pricing.html">Pricing</a></li>
          <li><a href="/materials.html">Materials Guide</a></li>
        </ul>
      </nav>
      <div class="site-header__actions">
        <a class="btn btn--ghost" href="/app/login">Log in</a>
        <a class="btn btn--primary" href="/app/register">Start free trial</a>
        <button id="theme-toggle" class="theme-toggle" type="button" aria-label="Toggle dark mode">
          <span aria-hidden="true">◐</span>
        </button>
      </div>
    </div>
  </header>

  <main>
    <section class="hero wrap">
      <p class="eyebrow">Now live</p>
      <h1>Run your 3D print shop like a business.</h1>
      <p class="hero__sub">
        One place for customers, printers, filament, job costing, and
        quotes &amp; invoices — built for small 3D-printing businesses.
        14-day free trial, card required upfront, cancel anytime.
      </p>
      <a class="btn btn--primary" href="/app/register">Start your free trial</a>
    </section>

    <section class="stats-strip wrap" id="stats-strip" hidden aria-label="Barkie usage stats">
      <div class="stat-tile">
        <p class="stat-tile__value" id="stat-businesses">—</p>
        <p class="stat-tile__label">Registered businesses</p>
      </div>
      <div class="stat-tile">
        <p class="stat-tile__value" id="stat-subscriptions">—</p>
        <p class="stat-tile__label">Active subscriptions</p>
      </div>
    </section>

    <section class="features wrap" aria-label="What Barkie does">
      <div class="card">
        <h3>True job costing</h3>
        <p>Filament, print time, electricity, machine wear, labour, and consumables — rolled into one real cost and a suggested sell price.</p>
      </div>
      <div class="card">
        <h3>Quotes &amp; invoices</h3>
        <p>Build a quote from a saved costing template, send it branded with your logo, and convert it to an invoice in one click.</p>
      </div>
      <div class="card">
        <h3>Printers &amp; filament, tracked</h3>
        <p>Printer specs and presets, filament spools and stock levels, consumables — all in one record-keeping home.</p>
      </div>
    </section>
  </main>

  <footer class="site-footer">
    <div class="wrap site-footer__inner">
      <span>&copy; <span id="year"></span> Barkie</span>
      <a href="mailto:hello@barkie.co.za">hello@barkie.co.za</a>
      <a href="/pricing.html">Pricing</a>
      <a href="/materials.html">Materials Guide</a>
    </div>
  </footer>

  <script src="/js/shared.js"></script>
  <script src="/js/home.js"></script>
</body>
</html>
```

Note: the notify-signup form is removed from this page's content (the
site is live now, not "coming soon" — the real CTA is "Start free trial"
→ `/app/register`). The `/api/notify` endpoint and `/admin/signups` view
in `server.js` are left untouched (harmless, no cleanup needed this
phase).

- [ ] **Step 5: Fetch and render the stats strip**

Create `landing/public/js/home.js`:

```javascript
(async function () {
  const strip = document.getElementById('stats-strip');
  const businessesEl = document.getElementById('stat-businesses');
  const subscriptionsEl = document.getElementById('stat-subscriptions');

  try {
    const res = await fetch('/api/public/stats');
    if (!res.ok) throw new Error('non-200 response');
    const data = await res.json();
    if (!data.ok) throw new Error('ok:false response');

    businessesEl.textContent = String(data.registeredBusinesses);
    subscriptionsEl.textContent = String(data.activeSubscriptions);
    strip.hidden = false;
  } catch (err) {
    // A marketing page silently showing no stats is better than a
    // visibly-broken widget — leave the strip hidden.
    console.error('Failed to load public stats:', err);
  }
})();
```

- [ ] **Step 6: Manual smoke test**

Run `cd landing && npm start`, visit `http://localhost:4100`. Confirm:
nav links present, theme toggle still works, hero/features render, and
(once `platform/api` is also running locally with some seeded data) the
stats strip populates and un-hides. If `platform/api` isn't running
locally, confirm the strip stays hidden with no console-visible crash
(a caught fetch error is fine, an uncaught exception is not).

- [ ] **Step 7: Commit**

```bash
cd landing
git add public/index.html public/styles.css public/js/shared.js public/js/home.js public/main.js
git commit -m "Rebuild Home page: nav, live stats strip, real CTA replacing the notify form"
```

---

### Task 3: Pricing page

**Files:**
- Create: `landing/public/pricing.html`
- Create: `landing/public/js/pricing.js`
- Modify: `landing/public/styles.css`

**Interfaces:**
- Consumes: `GET /api/public/plans` (Task 1).

- [ ] **Step 1: Add pricing-card, FAQ, and comparison-note styles**

Append to `landing/public/styles.css`:

```css
.page-header {
  padding: 56px 24px 32px;
}

.page-header h1 {
  font-family: var(--font-serif);
  font-size: clamp(28px, 4vw, 40px);
  margin: 0 0 12px;
}

.page-header p {
  color: var(--ink-muted);
  font-size: 17px;
  max-width: 60ch;
  margin: 0;
}

.tier-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 24px;
  padding: 0 24px 48px;
}

.tier-card {
  background: var(--surface-soft);
  border: 2px solid var(--ink);
  border-radius: 10px;
  padding: 28px;
  box-shadow: 7px 7px 0 0 var(--ink);
  display: flex;
  flex-direction: column;
}

.tier-card h2 {
  font-family: var(--font-serif);
  font-size: 22px;
  margin: 0 0 4px;
}

.tier-card__positioning {
  color: var(--ink-muted);
  font-size: 14px;
  margin: 0 0 16px;
}

.tier-card__price {
  font-family: var(--font-serif);
  font-size: 36px;
  font-weight: 700;
  margin: 0 0 4px;
}

.tier-card__price span {
  font-size: 15px;
  font-weight: 400;
  color: var(--ink-muted);
}

.tier-card__features {
  list-style: none;
  margin: 16px 0 24px;
  padding: 0;
  flex: 1;
}

.tier-card__features li {
  padding: 6px 0;
  font-size: 14px;
  border-bottom: 1px solid var(--surface);
}

.compare-note {
  margin: 0 24px 48px;
  padding: 20px 24px;
  border: 2px solid var(--ink);
  border-radius: 10px;
  background: var(--surface);
  max-width: 720px;
}

.compare-note h2 {
  font-family: var(--font-serif);
  font-size: 18px;
  margin: 0 0 8px;
}

.compare-note p {
  color: var(--ink-muted);
  font-size: 14px;
  margin: 0 0 8px;
}

.faq {
  padding: 0 24px 64px;
  max-width: 720px;
}

.faq h2 {
  font-family: var(--font-serif);
  font-size: 22px;
  margin: 0 0 20px;
}

.faq-item {
  border: 2px solid var(--ink);
  border-radius: 8px;
  margin-bottom: 12px;
  overflow: hidden;
}

.faq-item summary {
  padding: 14px 18px;
  cursor: pointer;
  font-weight: 700;
  list-style: none;
}

.faq-item summary::-webkit-details-marker {
  display: none;
}

.faq-item summary::after {
  content: '+';
  float: right;
}

.faq-item[open] summary::after {
  content: '−';
}

.faq-item p {
  margin: 0;
  padding: 0 18px 16px;
  color: var(--ink-muted);
  font-size: 14px;
}

.pricing-status {
  padding: 0 24px 24px;
  color: var(--ink-muted);
}
```

- [ ] **Step 2: Build pricing.html**

Create `landing/public/pricing.html` (nav/header/footer copied from
`index.html`, `aria-current="page"` moved to the Pricing link):

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Pricing — Barkie</title>
  <meta name="description" content="Barkie pricing: three plans, R25 to R70 a month, 14-day free trial." />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
  <header class="site-header">
    <div class="wrap site-header__inner">
      <span class="wordmark">Barkie</span>
      <nav aria-label="Primary">
        <ul class="site-nav">
          <li><a href="/">Home</a></li>
          <li><a href="/pricing.html" aria-current="page">Pricing</a></li>
          <li><a href="/materials.html">Materials Guide</a></li>
        </ul>
      </nav>
      <div class="site-header__actions">
        <a class="btn btn--ghost" href="/app/login">Log in</a>
        <a class="btn btn--primary" href="/app/register">Start free trial</a>
        <button id="theme-toggle" class="theme-toggle" type="button" aria-label="Toggle dark mode">
          <span aria-hidden="true">◐</span>
        </button>
      </div>
    </div>
  </header>

  <main>
    <section class="page-header wrap">
      <h1>Simple, honest pricing.</h1>
      <p>Three plans, priced by how many printers you run. Every plan includes the full toolset — customers, printers, costing, quotes and invoices. 14-day free trial, card required upfront, cancel anytime.</p>
    </section>

    <div class="pricing-status wrap" id="pricing-status">Loading plans…</div>
    <section class="tier-grid wrap" id="tier-grid" hidden aria-label="Pricing plans"></section>

    <section class="compare-note wrap">
      <h2>What's the same on every plan</h2>
      <p>Every Barkie plan includes the full costing engine, unlimited customers, quotes and invoices with PDF generation and email sending, and printer/filament tracking. The plans differ only in price, sized to how many printers a shop typically runs — Barkie doesn't yet enforce a hard printer or document limit, so pick whichever tier matches your business honestly rather than worrying about hitting a wall.</p>
    </section>

    <section class="faq wrap">
      <h2>Still deciding?</h2>
      <details class="faq-item">
        <summary>When do I actually get charged?</summary>
        <p>Your card is captured at signup but not charged. You get a 14-day free trial; the real monthly charge happens automatically when the trial ends, unless you cancel first.</p>
      </details>
      <details class="faq-item">
        <summary>Can I cancel anytime?</summary>
        <p>Yes, from your billing settings inside Barkie. Cancelling stops future billing immediately.</p>
      </details>
      <details class="faq-item">
        <summary>What happens if a payment fails?</summary>
        <p>Your account gets a 7-day grace period where everything still works. If the card still hasn't gone through after 7 days, your account becomes read-only — your data is safe, you just can't create or edit anything until you resubscribe.</p>
      </details>
      <details class="faq-item">
        <summary>Can I switch plans later?</summary>
        <p>Not as an in-place upgrade yet — cancel your current plan and start a new one on the tier you want.</p>
      </details>
    </section>
  </main>

  <footer class="site-footer">
    <div class="wrap site-footer__inner">
      <span>&copy; <span id="year"></span> Barkie</span>
      <a href="mailto:hello@barkie.co.za">hello@barkie.co.za</a>
      <a href="/pricing.html">Pricing</a>
      <a href="/materials.html">Materials Guide</a>
    </div>
  </footer>

  <script src="/js/shared.js"></script>
  <script src="/js/pricing.js"></script>
</body>
</html>
```

- [ ] **Step 3: Fetch and render the tier cards**

Create `landing/public/js/pricing.js`. Per-tier positioning copy and
feature lists are hand-written here (the API only supplies name/price) —
worded as guidance, never as an enforced cap, per this plan's Global
Constraints:

```javascript
(async function () {
  const TIER_COPY = {
    'Tier 1': {
      positioning: 'Recommended for a single-printer shop or a busy hobbyist going pro.',
      features: [
        'Unlimited customers, quotes and invoices',
        'Full costing engine (filament, time, machine wear, labour)',
        'PDF quotes/invoices with real email sending',
        'Printer, filament and consumables tracking',
      ],
    },
    'Tier 2': {
      positioning: 'Recommended for a small shop running 2-4 printers.',
      features: [
        'Everything in Tier 1',
        'Built for a growing print queue',
        'Priority in future support responses',
      ],
    },
    'Tier 3': {
      positioning: 'Recommended for a multi-printer farm or a shop with a real staff.',
      features: [
        'Everything in Tier 1 and 2',
        'Built for higher job volume',
        'First in line for new features',
      ],
    },
  };

  const statusEl = document.getElementById('pricing-status');
  const grid = document.getElementById('tier-grid');

  function renderTierCard(plan) {
    const copy = TIER_COPY[plan.name] ?? { positioning: '', features: [] };
    const card = document.createElement('div');
    card.className = 'tier-card';

    const heading = document.createElement('h2');
    heading.textContent = plan.name;
    card.appendChild(heading);

    const positioning = document.createElement('p');
    positioning.className = 'tier-card__positioning';
    positioning.textContent = copy.positioning;
    card.appendChild(positioning);

    const price = document.createElement('p');
    price.className = 'tier-card__price';
    price.textContent = `R${plan.monthlyPrice} `;
    const perMonth = document.createElement('span');
    perMonth.textContent = '/ month';
    price.appendChild(perMonth);
    card.appendChild(price);

    const featureList = document.createElement('ul');
    featureList.className = 'tier-card__features';
    for (const feature of copy.features) {
      const li = document.createElement('li');
      li.textContent = feature;
      featureList.appendChild(li);
    }
    card.appendChild(featureList);

    const cta = document.createElement('a');
    cta.className = 'btn btn--primary';
    cta.href = '/app/register';
    cta.textContent = 'Start free trial';
    card.appendChild(cta);

    return card;
  }

  try {
    const res = await fetch('/api/public/plans');
    if (!res.ok) throw new Error('non-200 response');
    const data = await res.json();
    if (!data.ok || !Array.isArray(data.plans) || data.plans.length === 0) {
      throw new Error('no plans returned');
    }

    for (const plan of data.plans) {
      grid.appendChild(renderTierCard(plan));
    }
    grid.hidden = false;
    statusEl.remove();
  } catch (err) {
    console.error('Failed to load plans:', err);
    statusEl.textContent = "Couldn't load pricing right now — please refresh, or contact hello@barkie.co.za.";
  }
})();
```

- [ ] **Step 4: Manual smoke test**

With `platform/api` running locally (seeded with the 3 real plans) and
`landing/` running, visit `http://localhost:4100/pricing.html`. Confirm
3 cards render with real R25/R45/R70 prices, FAQ accordion opens/closes,
nav highlights Pricing as current.

- [ ] **Step 5: Commit**

```bash
cd landing
git add public/pricing.html public/js/pricing.js public/styles.css
git commit -m "Add Pricing page with live plan data, comparison note, and FAQ"
```

---

### Task 4: Materials dataset

**Files:**
- Create: `landing/public/js/materials-data.js`

**Interfaces:**
- Produces: `export const MATERIALS: Material[]` — the exact shape below, consumed by Tasks 5, 6, and 7.

- [ ] **Step 1: Author the dataset**

Create `landing/public/js/materials-data.js` as an ES module exporting
`MATERIALS`, an array of exactly this shape:

```javascript
/**
 * @typedef {Object} Material
 * @property {string} id
 * @property {string} name
 * @property {string} chemistry
 * @property {string} bestFor
 * @property {{ nozzleTempC: number, bedTempC: number, requiresEnclosure: boolean, requiresHardenedNozzle: boolean, requiresDirectDrive: boolean, recommendsDryFilament: boolean, recommendsVentilation: boolean }} printerRequirements
 * @property {'Beginner'|'Intermediate'|'Advanced'} difficulty
 * @property {'Low'|'Medium'|'High'} moisture
 * @property {boolean} abrasive
 * @property {{ low: number, high: number, estimated: boolean }} priceZarPerKg
 * @property {string} whyChooseIt
 * @property {string} avoidWhenText
 * @property {Array<'beginner-friendly'|'flexible'|'outdoor-safe'|'food-safe'|'engineering'>} tags
 * @property {{ outdoorUV: boolean, flexibility: boolean, chemicalResistance: boolean, foodContact: boolean, easyToPrint: boolean, lowCost: boolean, smoothAppearance: boolean, highDimensionalAccuracy: boolean }} capabilities
 */

export const MATERIALS = [
  // ... entries below
];
```

Author **4 complete worked examples first** (these exact 4, verbatim —
they set the calibration for the rest and are what Task 6's tests import
as fixtures):

```javascript
{
  id: 'pla',
  name: 'PLA',
  chemistry: 'Polylactic acid',
  bestFor: 'Display models, prototypes and light indoor parts',
  printerRequirements: {
    nozzleTempC: 200, bedTempC: 60,
    requiresEnclosure: false, requiresHardenedNozzle: false, requiresDirectDrive: false,
    recommendsDryFilament: false, recommendsVentilation: false,
  },
  difficulty: 'Beginner',
  moisture: 'Low',
  abrasive: false,
  priceZarPerKg: { low: 295, high: 425, estimated: false },
  whyChooseIt: 'Prints cleanly on almost any machine with no tuning.',
  avoidWhenText: 'The part will sit in a hot car, in direct sun, or carry sustained load — PLA softens well below 60°C and creeps under stress over time.',
  tags: ['beginner-friendly'],
  capabilities: {
    outdoorUV: false, flexibility: false, chemicalResistance: false, foodContact: false,
    easyToPrint: true, lowCost: true, smoothAppearance: true, highDimensionalAccuracy: true,
  },
},
{
  id: 'petg',
  name: 'PETG',
  chemistry: 'Glycol-modified PET',
  bestFor: 'Everyday functional parts, indoors or out of direct sun',
  printerRequirements: {
    nozzleTempC: 230, bedTempC: 70,
    requiresEnclosure: false, requiresHardenedNozzle: false, requiresDirectDrive: false,
    recommendsDryFilament: true, recommendsVentilation: false,
  },
  difficulty: 'Beginner',
  moisture: 'Medium',
  abrasive: false,
  priceZarPerKg: { low: 290, high: 450, estimated: false },
  whyChooseIt: 'Strong, a little flexible, and noticeably tougher than PLA for a similar price.',
  avoidWhenText: 'You need crisp fine detail (PETG strings more than PLA) or real heat resistance.',
  tags: ['beginner-friendly'],
  capabilities: {
    outdoorUV: false, flexibility: false, chemicalResistance: true, foodContact: false,
    easyToPrint: true, lowCost: true, smoothAppearance: false, highDimensionalAccuracy: false,
  },
},
{
  id: 'abs',
  name: 'ABS',
  chemistry: 'Acrylonitrile butadiene styrene',
  bestFor: 'Enclosure parts, housings and heat-exposed indoor parts',
  printerRequirements: {
    nozzleTempC: 230, bedTempC: 90,
    requiresEnclosure: true, requiresHardenedNozzle: false, requiresDirectDrive: false,
    recommendsDryFilament: false, recommendsVentilation: true,
  },
  difficulty: 'Advanced',
  moisture: 'Low',
  abrasive: false,
  priceZarPerKg: { low: 300, high: 450, estimated: false },
  whyChooseIt: 'Good heat resistance (to roughly 100°C) and can be acetone-vapour-smoothed.',
  avoidWhenText: 'You print in a bedroom or unventilated space (styrene fumes) or your printer has no enclosure — ABS warps and delaminates badly without one.',
  tags: ['engineering'],
  capabilities: {
    outdoorUV: false, flexibility: false, chemicalResistance: true, foodContact: false,
    easyToPrint: false, lowCost: true, smoothAppearance: true, highDimensionalAccuracy: false,
  },
},
{
  id: 'peek',
  name: 'PEEK',
  chemistry: 'Polyether ether ketone',
  bestFor: 'Aerospace, medical and extreme-temperature parts',
  printerRequirements: {
    nozzleTempC: 360, bedTempC: 120,
    requiresEnclosure: true, requiresHardenedNozzle: true, requiresDirectDrive: false,
    recommendsDryFilament: true, recommendsVentilation: true,
  },
  difficulty: 'Advanced',
  moisture: 'Medium',
  abrasive: false,
  priceZarPerKg: { low: 8000, high: 15000, estimated: true },
  whyChooseIt: 'Metal-like strength and stiffness, holds up past 250°C, chemically near-inert.',
  avoidWhenText: 'You don’t have a genuine high-temperature industrial printer — most desktop machines simply cannot reach PEEK’s processing temperature at all.',
  tags: ['engineering'],
  capabilities: {
    outdoorUV: true, flexibility: false, chemicalResistance: true, foodContact: false,
    easyToPrint: false, lowCost: false, smoothAppearance: false, highDimensionalAccuracy: true,
  },
},
```

Then author the remaining materials in the same complete shape, one
entry each, covering exactly this list (26 total including the 4 above):
**PLA-CF, Silk PLA, Matte PLA, Wood PLA, Tough PLA, PETG-CF, ASA, ASA-CF,
TPU (95A), TPE, Nylon (PA), PA-CF (Nylon-CF), Polycarbonate (PC), PC-ABS,
HIPS, PVA, PVB, Polypropylene (PP), PBT, PBT-GF, PBT-CF, PC-PBT, PET-CF,
PPS-CF**. For each: derive realistic printer requirements from the base
material it's a variant of (e.g. PLA-CF needs everything PLA needs plus
`requiresHardenedNozzle: true` since carbon fiber is abrasive — set
`abrasive: true` too), write an honest `whyChooseIt`/`avoidWhenText` pair
specific to that material (not a copy-paste of a similar one), and follow
the Global Constraints section above for `priceZarPerKg` — spot-check
real South African retailer pricing for the common ones (PLA-CF, PETG-CF,
ASA, TPU, Nylon, PC), mark the rest `estimated: true`. None of these 26
materials should set `capabilities.foodContact: true` without a matching
nozzle/post-processing caveat visible in its own `avoidWhenText`, since
raw filament food-safety claims are genuinely conditional — in practice,
it's fine for all 26 to leave `foodContact: false` and let the page's
shared disclaimer (Task 5) carry that caveat generally, rather than
making a specific claim per material.

- [ ] **Step 2: Manual sanity check**

Open Node's REPL or a scratch script and confirm: `MATERIALS.length ===
26` (or your final count — update the number in Step 3's commit message
to match), every entry has all required fields (no `undefined`), every
`id` is unique, every `tags` array only uses the 5 allowed values, every
`priceZarPerKg.low <= priceZarPerKg.high`.

- [ ] **Step 3: Commit**

```bash
cd landing
git add public/js/materials-data.js
git commit -m "Add the 26-material dataset backing the Materials Guide"
```

---

### Task 5: Materials Guide — All materials grid view

**Files:**
- Create: `landing/public/materials.html` (scaffold — Task 6 and 7 add their sections into the same file)
- Create: `landing/public/js/materials.js` (scaffold — Task 6 and 7 extend this)
- Modify: `landing/public/styles.css`

**Interfaces:**
- Consumes: `MATERIALS` from `materials-data.js` (Task 4).
- Produces: the page shell (nav, view-switcher tabs, footer) that Tasks 6 and 7 render their content into — `#view-selector`, `#view-grid`, `#view-compare` container divs, and a `switchView(name)` function in `materials.js` that Tasks 6/7 don't need to reimplement. Also produces `window.__MATERIALS__ = MATERIALS;`, the shared handle Tasks 6/7 read from.

- [ ] **Step 1: Add grid, card, tag-filter, and view-tab styles**

Append to `landing/public/styles.css`:

```css
.view-tabs {
  display: flex;
  gap: 8px;
  padding: 0 24px 32px;
  flex-wrap: wrap;
}

.view-tab {
  border: 2px solid var(--ink);
  background: var(--surface);
  color: var(--ink);
  border-radius: 6px;
  padding: 10px 18px;
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
}

.view-tab[aria-selected="true"] {
  background: var(--color-terracotta);
  color: var(--color-cream);
}

.view-panel[hidden] {
  display: none;
}

.tag-filters {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  padding: 0 24px 8px;
}

.tag-filter {
  border: 2px solid var(--ink);
  background: var(--surface);
  color: var(--ink);
  border-radius: 999px;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.tag-filter[aria-pressed="true"] {
  background: var(--color-terracotta);
  color: var(--color-cream);
}

.material-search {
  margin: 0 24px 24px;
  max-width: 320px;
  display: block;
  font-family: var(--font-sans);
  font-size: 15px;
  padding: 12px 14px;
  border: 2px solid var(--ink);
  border-radius: 6px;
  background: var(--surface);
  color: var(--ink);
}

.material-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 20px;
  padding: 0 24px 24px;
}

.material-card {
  background: var(--surface-soft);
  border: 2px solid var(--ink);
  border-radius: 10px;
  padding: 20px;
  box-shadow: 6px 6px 0 0 var(--ink);
}

.material-card h3,
.material-card h4 {
  font-family: var(--font-serif);
  font-size: 19px;
  margin: 0 0 2px;
}

.material-card__chemistry {
  font-size: 12px;
  color: var(--ink-muted);
  margin: 0 0 12px;
}

.material-card__best-for {
  font-size: 14px;
  margin: 0 0 12px;
}

.req-list {
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  margin: 0 0 12px;
  padding: 0;
  font-size: 13px;
}

.req-list li::before {
  content: '✓ ';
  color: var(--color-olive);
}

.req-list li[data-req-state="hard"]::before {
  content: '✗ ';
  color: var(--color-terracotta);
}

.req-list li[data-req-state="soft"]::before {
  content: '⚠ ';
  color: var(--color-espresso);
}

.material-card__meta {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 12px;
  font-size: 13px;
  margin: 0 0 12px;
}

.material-card__meta dt {
  color: var(--ink-muted);
}

.material-card__meta dd {
  margin: 0;
  font-weight: 700;
  text-align: right;
}

.material-card__why,
.material-card__avoid {
  font-size: 13px;
  margin: 0 0 6px;
}

.material-card__why strong {
  color: var(--color-olive);
}

.material-card__avoid strong {
  color: var(--color-terracotta);
}

.eyebrow-label {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--ink-muted);
  margin: 0 0 4px;
}

.materials-disclaimer {
  padding: 24px;
  margin: 0 24px 64px;
  border-top: 2px solid var(--ink);
  font-size: 12px;
  color: var(--ink-muted);
  max-width: 900px;
}
```

- [ ] **Step 2: Build materials.html shell + grid markup**

Create `landing/public/materials.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Materials Guide — Barkie</title>
  <meta name="description" content="Pick the right 3D printing material for your printer and your part — an interactive selector, a browsable material library, and head-to-head comparisons." />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
  <header class="site-header">
    <div class="wrap site-header__inner">
      <span class="wordmark">Barkie</span>
      <nav aria-label="Primary">
        <ul class="site-nav">
          <li><a href="/">Home</a></li>
          <li><a href="/pricing.html">Pricing</a></li>
          <li><a href="/materials.html" aria-current="page">Materials Guide</a></li>
        </ul>
      </nav>
      <div class="site-header__actions">
        <a class="btn btn--ghost" href="/app/login">Log in</a>
        <a class="btn btn--primary" href="/app/register">Start free trial</a>
        <button id="theme-toggle" class="theme-toggle" type="button" aria-label="Toggle dark mode">
          <span aria-hidden="true">◐</span>
        </button>
      </div>
    </div>
  </header>

  <main>
    <section class="page-header wrap">
      <h1>3D printing material selector</h1>
      <p>Set what the part needs to do and what your printer can handle, and you'll only see materials that will actually work. Prices are South African.</p>
    </section>

    <div class="view-tabs wrap" role="tablist" aria-label="Materials Guide views">
      <button class="view-tab" role="tab" id="tab-selector" aria-controls="view-selector" aria-selected="true" type="button">Selector</button>
      <button class="view-tab" role="tab" id="tab-grid" aria-controls="view-grid" aria-selected="false" type="button">All materials</button>
      <button class="view-tab" role="tab" id="tab-compare" aria-controls="view-compare" aria-selected="false" type="button">Head to head</button>
    </div>

    <div class="view-panel wrap" id="view-selector" role="tabpanel" aria-labelledby="tab-selector">
      <!-- Task 6 renders the Selector view here -->
    </div>

    <div class="view-panel wrap" id="view-grid" role="tabpanel" aria-labelledby="tab-grid" hidden>
      <div class="tag-filters" id="tag-filters"></div>
      <input class="material-search" id="material-search" type="search" placeholder="Search materials…" aria-label="Search materials" />
      <div class="material-grid" id="material-grid"></div>
    </div>

    <div class="view-panel wrap" id="view-compare" role="tabpanel" aria-labelledby="tab-compare" hidden>
      <!-- Task 7 renders the Head to head view here -->
    </div>

    <p class="materials-disclaimer wrap">
      Print settings above are typical starting points from manufacturer datasheets and vary by brand and printer — always check your own spool's label. Prices were checked against South African retailers and cover mainstream local stock, not premium import brands, which often run roughly double; anything marked "Estimated" is our best available figure. Prices move with the rand. Whether a printed part is genuinely food-safe depends on the filament brand's additives, the nozzle material, and how the part was post-processed — check with the filament manufacturer before relying on it for food contact.
    </p>
  </main>

  <footer class="site-footer">
    <div class="wrap site-footer__inner">
      <span>&copy; <span id="year"></span> Barkie</span>
      <a href="mailto:hello@barkie.co.za">hello@barkie.co.za</a>
      <a href="/pricing.html">Pricing</a>
      <a href="/materials.html">Materials Guide</a>
    </div>
  </footer>

  <script type="module" src="/js/materials.js"></script>
  <script src="/js/shared.js"></script>
</body>
</html>
```

(`materials.js` is loaded as `type="module"` so it can `import` from
`materials-data.js`; `shared.js` stays a plain script since it's not a
module and doesn't need to be.)

- [ ] **Step 3: Build the tab-switcher, shared req-list renderer, and grid rendering in materials.js**

Create `landing/public/js/materials.js` — this is the scaffold Task 6/7
extend. For this task, implement the tab switcher, `renderReqList`
(shared with Task 6's Selector cards), the tag-filter chips, the search
box, and grid card rendering. Every dynamic element below is built with
`createElement`/`textContent`/`appendChild` — no template-string markup
assignment anywhere in this file, per this plan's Global Constraints:

```javascript
import { MATERIALS } from './materials-data.js';

window.__MATERIALS__ = MATERIALS;

// ---- View switching ----
const TABS = ['selector', 'grid', 'compare'];

function switchView(name) {
  for (const tab of TABS) {
    const btn = document.getElementById(`tab-${tab}`);
    const panel = document.getElementById(`view-${tab}`);
    const active = tab === name;
    btn.setAttribute('aria-selected', String(active));
    panel.hidden = !active;
  }
}

for (const tab of TABS) {
  document.getElementById(`tab-${tab}`).addEventListener('click', () => switchView(tab));
}

// ---- Shared: printer-requirement list (used by the grid and the Selector's result cards) ----
function renderReqList(material) {
  const list = document.createElement('ul');
  list.className = 'req-list';

  const plain = (text) => {
    const li = document.createElement('li');
    li.textContent = text;
    list.appendChild(li);
  };
  const flagged = (text, state) => {
    const li = document.createElement('li');
    li.dataset.reqState = state;
    li.textContent = text;
    list.appendChild(li);
  };

  const req = material.printerRequirements;
  plain(`${req.nozzleTempC} °C nozzle`);
  plain(`${req.bedTempC} °C bed`);
  if (req.requiresEnclosure) flagged('Enclosure', 'hard');
  if (req.requiresHardenedNozzle) flagged('Hardened nozzle', 'hard');
  if (req.requiresDirectDrive) plain('Direct drive');
  if (req.recommendsDryFilament) flagged('Dry filament', 'soft');
  if (req.recommendsVentilation) flagged('Ventilation', 'soft');

  return list;
}

// ---- Grid view ----
const TAG_LABELS = {
  'beginner-friendly': 'Beginner-friendly',
  flexible: 'Flexible',
  'outdoor-safe': 'Outdoor-safe',
  'food-safe': 'Food-safe',
  engineering: 'Engineering',
};

function renderMaterialCard(material) {
  const card = document.createElement('div');
  card.className = 'material-card';

  const heading = document.createElement('h3');
  heading.textContent = material.name;
  card.appendChild(heading);

  const chemistry = document.createElement('p');
  chemistry.className = 'material-card__chemistry';
  chemistry.textContent = material.chemistry;
  card.appendChild(chemistry);

  const bestFor = document.createElement('p');
  bestFor.className = 'material-card__best-for';
  const bestForStrong = document.createElement('strong');
  bestForStrong.textContent = 'Best for: ';
  bestFor.appendChild(bestForStrong);
  bestFor.appendChild(document.createTextNode(material.bestFor));
  card.appendChild(bestFor);

  card.appendChild(renderReqList(material));

  const meta = document.createElement('dl');
  meta.className = 'material-card__meta';
  const metaRow = (label, value) => {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    meta.appendChild(dt);
    meta.appendChild(dd);
  };
  metaRow('Difficulty', material.difficulty);
  metaRow('Moisture', material.moisture);
  metaRow('Abrasive', material.abrasive ? 'Yes' : 'No');
  metaRow(
    'Price',
    `R${material.priceZarPerKg.low}–R${material.priceZarPerKg.high}/kg${material.priceZarPerKg.estimated ? ' (est.)' : ''}`,
  );
  card.appendChild(meta);

  const why = document.createElement('p');
  why.className = 'material-card__why';
  const whyStrong = document.createElement('strong');
  whyStrong.textContent = 'Why choose it: ';
  why.appendChild(whyStrong);
  why.appendChild(document.createTextNode(material.whyChooseIt));
  card.appendChild(why);

  const avoid = document.createElement('p');
  avoid.className = 'material-card__avoid';
  const avoidStrong = document.createElement('strong');
  avoidStrong.textContent = 'Avoid when: ';
  avoid.appendChild(avoidStrong);
  avoid.appendChild(document.createTextNode(material.avoidWhenText));
  card.appendChild(avoid);

  return card;
}

let activeTag = null;
let searchTerm = '';

function matchesFilters(material) {
  if (activeTag && !material.tags.includes(activeTag)) return false;
  if (searchTerm) {
    const haystack = `${material.name} ${material.chemistry} ${material.bestFor}`.toLowerCase();
    if (!haystack.includes(searchTerm)) return false;
  }
  return true;
}

function renderGrid() {
  const grid = document.getElementById('material-grid');
  grid.textContent = '';
  for (const material of MATERIALS) {
    if (matchesFilters(material)) {
      grid.appendChild(renderMaterialCard(material));
    }
  }
}

function renderTagFilters() {
  const container = document.getElementById('tag-filters');
  const allBtn = document.createElement('button');
  allBtn.type = 'button';
  allBtn.className = 'tag-filter';
  allBtn.textContent = `All materials (${MATERIALS.length})`;
  allBtn.setAttribute('aria-pressed', 'true');
  allBtn.addEventListener('click', () => {
    activeTag = null;
    for (const btn of container.querySelectorAll('.tag-filter')) {
      btn.setAttribute('aria-pressed', String(btn === allBtn));
    }
    renderGrid();
  });
  container.appendChild(allBtn);

  for (const [tag, label] of Object.entries(TAG_LABELS)) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tag-filter';
    btn.textContent = label;
    btn.setAttribute('aria-pressed', 'false');
    btn.addEventListener('click', () => {
      activeTag = tag;
      for (const b of container.querySelectorAll('.tag-filter')) {
        b.setAttribute('aria-pressed', String(b === btn));
      }
      renderGrid();
    });
    container.appendChild(btn);
  }
}

document.getElementById('material-search').addEventListener('input', (event) => {
  searchTerm = event.target.value.trim().toLowerCase();
  renderGrid();
});

renderTagFilters();
renderGrid();
```

- [ ] **Step 4: Manual smoke test**

Visit `http://localhost:4100/materials.html`. Confirm: 3 tabs switch
correctly (Selector and Head to head panels are empty until Tasks 6/7
land — that's expected at this point), "All materials" tab shows every
card, tag filters narrow the grid, search narrows by name/chemistry/
best-for, req-list icons render (✓/✗/⚠) correctly per material.

- [ ] **Step 5: Commit**

```bash
cd landing
git add public/materials.html public/js/materials.js public/styles.css
git commit -m "Add Materials Guide shell, tab switcher, and All materials grid view"
```

---

### Task 6: Materials Guide — Selector view

**Files:**
- Create: `landing/public/js/materials-selector.js` (pure logic, no DOM — the testable module)
- Modify: `landing/public/js/materials.js` (renders the Selector view using the above)
- Modify: `landing/public/styles.css`
- Create: `landing/tests/materialsSelector.test.js`
- Modify: `landing/package.json` (add a `test` script)

**Interfaces:**
- Consumes: `window.__MATERIALS__`, `renderReqList` (both from Task 5's `materials.js`).
- Produces: `filterAndRank(materials, printerProfile, requiredCapabilities)` — a pure function, exported from `materials-selector.js`, used by both `materials.js` (real UI) and this task's tests (fixture data).

This is the one piece of the Materials Guide with real "could give wrong
advice" stakes, so it gets an automated test — everything else in this
plan is smoke-tested by hand.

- [ ] **Step 1: Write the failing tests**

Create `landing/tests/materialsSelector.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterAndRank } from '../public/js/materials-selector.js';

const PROFILE_HOBBYIST = {
  maxNozzleTempC: 260,
  maxBedTempC: 100,
  hasEnclosure: false,
  hasHardenedNozzle: false,
  hasDirectDrive: false,
};

const PLA_LIKE = {
  id: 'pla-like', name: 'PLA-like', chemistry: 'x', bestFor: 'x',
  printerRequirements: {
    nozzleTempC: 200, bedTempC: 60,
    requiresEnclosure: false, requiresHardenedNozzle: false, requiresDirectDrive: false,
    recommendsDryFilament: false, recommendsVentilation: false,
  },
  difficulty: 'Beginner', moisture: 'Low', abrasive: false,
  priceZarPerKg: { low: 100, high: 200, estimated: false },
  whyChooseIt: 'x', avoidWhenText: 'x', tags: [],
  capabilities: {
    outdoorUV: false, flexibility: false, chemicalResistance: false, foodContact: false,
    easyToPrint: true, lowCost: true, smoothAppearance: true, highDimensionalAccuracy: true,
  },
};

const PEEK_LIKE = {
  id: 'peek-like', name: 'PEEK-like', chemistry: 'x', bestFor: 'x',
  printerRequirements: {
    nozzleTempC: 360, bedTempC: 120,
    requiresEnclosure: true, requiresHardenedNozzle: true, requiresDirectDrive: false,
    recommendsDryFilament: true, recommendsVentilation: true,
  },
  difficulty: 'Advanced', moisture: 'Medium', abrasive: false,
  priceZarPerKg: { low: 8000, high: 15000, estimated: true },
  whyChooseIt: 'x', avoidWhenText: 'x', tags: [],
  capabilities: {
    outdoorUV: true, flexibility: false, chemicalResistance: true, foodContact: false,
    easyToPrint: false, lowCost: false, smoothAppearance: false, highDimensionalAccuracy: true,
  },
};

const OUTDOOR_ADVANCED = {
  id: 'outdoor-advanced', name: 'Outdoor Advanced', chemistry: 'x', bestFor: 'x',
  printerRequirements: {
    nozzleTempC: 240, bedTempC: 90,
    requiresEnclosure: false, requiresHardenedNozzle: false, requiresDirectDrive: false,
    recommendsDryFilament: true, recommendsVentilation: false,
  },
  difficulty: 'Intermediate', moisture: 'Medium', abrasive: false,
  priceZarPerKg: { low: 300, high: 500, estimated: false },
  whyChooseIt: 'x', avoidWhenText: 'x', tags: [],
  capabilities: {
    outdoorUV: true, flexibility: false, chemicalResistance: false, foodContact: false,
    easyToPrint: false, lowCost: true, smoothAppearance: false, highDimensionalAccuracy: false,
  },
};

test('drops a material whose nozzle temp exceeds the printer profile', () => {
  const result = filterAndRank([PEEK_LIKE], PROFILE_HOBBYIST, {});
  assert.equal(result.matches.length, 0);
  assert.equal(result.dropped.length, 1);
  assert.equal(result.dropped[0].material.id, 'peek-like');
  assert.match(result.dropped[0].reason, /nozzle/i);
});

test('drops a material requiring an enclosure the printer profile lacks', () => {
  const enclosureMaterial = {
    ...PLA_LIKE,
    id: 'needs-enclosure',
    printerRequirements: { ...PLA_LIKE.printerRequirements, requiresEnclosure: true },
  };
  const result = filterAndRank([enclosureMaterial], PROFILE_HOBBYIST, {});
  assert.equal(result.matches.length, 0);
  assert.match(result.dropped[0].reason, /enclosure/i);
});

test('a material passes when the printer profile meets every hard requirement', () => {
  const result = filterAndRank([PLA_LIKE], PROFILE_HOBBYIST, {});
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].id, 'pla-like');
});

test('soft (recommends*) requirements never disqualify a material', () => {
  const dryOnly = {
    ...PLA_LIKE,
    id: 'dry-only',
    printerRequirements: { ...PLA_LIKE.printerRequirements, recommendsDryFilament: true, recommendsVentilation: true },
  };
  const result = filterAndRank([dryOnly], PROFILE_HOBBYIST, {});
  assert.equal(result.matches.length, 1);
});

test('drops a material that fails a ticked capability requirement', () => {
  const result = filterAndRank([PLA_LIKE], PROFILE_HOBBYIST, { outdoorUV: true });
  assert.equal(result.matches.length, 0);
  assert.match(result.dropped[0].reason, /outdoor/i);
});

test('a material passes when it satisfies every ticked capability', () => {
  const result = filterAndRank([OUTDOOR_ADVANCED], PROFILE_HOBBYIST, { outdoorUV: true });
  assert.equal(result.matches.length, 1);
});

test('ranking prefers lower difficulty, then lower price, among survivors', () => {
  const result = filterAndRank([OUTDOOR_ADVANCED, PLA_LIKE], PROFILE_HOBBYIST, {});
  // PLA_LIKE is Beginner + cheaper — must rank first
  assert.equal(result.matches[0].id, 'pla-like');
  assert.equal(result.matches[1].id, 'outdoor-advanced');
});

test('an unticked capability never filters anything out', () => {
  const result = filterAndRank([PLA_LIKE, OUTDOOR_ADVANCED, PEEK_LIKE], PROFILE_HOBBYIST, {
    outdoorUV: false,
    flexibility: false,
  });
  // PEEK_LIKE still drops on printer requirements, but not because of the (all-false) capability ticks
  const peekDrop = result.dropped.find((d) => d.material.id === 'peek-like');
  assert.ok(peekDrop);
  assert.match(peekDrop.reason, /nozzle|enclosure|hardened/i);
});
```

- [ ] **Step 2: Add a test script and confirm the tests fail**

In `landing/package.json`, add to `"scripts"`:

```json
"test": "node --test tests/"
```

Run: `cd landing && npm test`
Expected: FAIL — `Cannot find module '../public/js/materials-selector.js'`.

- [ ] **Step 3: Implement the pure filter/rank function**

Create `landing/public/js/materials-selector.js`:

```javascript
const DIFFICULTY_RANK = { Beginner: 0, Intermediate: 1, Advanced: 2 };

/**
 * @param {import('./materials-data.js').Material[]} materials
 * @param {{ maxNozzleTempC: number, maxBedTempC: number, hasEnclosure: boolean, hasHardenedNozzle: boolean, hasDirectDrive: boolean }} printerProfile
 * @param {Partial<Record<keyof import('./materials-data.js').Material['capabilities'], boolean>>} requiredCapabilities
 * @returns {{ matches: Array, dropped: Array<{ material: Object, reason: string }> }}
 */
export function filterAndRank(materials, printerProfile, requiredCapabilities) {
  const matches = [];
  const dropped = [];

  for (const material of materials) {
    const req = material.printerRequirements;

    if (req.nozzleTempC > printerProfile.maxNozzleTempC) {
      dropped.push({ material, reason: `Needs a ${req.nozzleTempC}°C nozzle — your printer maxes out at ${printerProfile.maxNozzleTempC}°C.` });
      continue;
    }
    if (req.bedTempC > printerProfile.maxBedTempC) {
      dropped.push({ material, reason: `Needs a ${req.bedTempC}°C bed — your printer maxes out at ${printerProfile.maxBedTempC}°C.` });
      continue;
    }
    if (req.requiresEnclosure && !printerProfile.hasEnclosure) {
      dropped.push({ material, reason: 'Needs an enclosure your printer doesn’t have.' });
      continue;
    }
    if (req.requiresHardenedNozzle && !printerProfile.hasHardenedNozzle) {
      dropped.push({ material, reason: 'Needs a hardened nozzle your printer doesn’t have.' });
      continue;
    }
    if (req.requiresDirectDrive && !printerProfile.hasDirectDrive) {
      dropped.push({ material, reason: 'Needs a direct-drive extruder your printer doesn’t have.' });
      continue;
    }

    const failedCapability = Object.entries(requiredCapabilities).find(
      ([capability, required]) => required && !material.capabilities[capability],
    );
    if (failedCapability) {
      dropped.push({ material, reason: `Doesn’t meet your "${failedCapability[0]}" requirement.` });
      continue;
    }

    matches.push(material);
  }

  matches.sort((a, b) => {
    const difficultyDiff = DIFFICULTY_RANK[a.difficulty] - DIFFICULTY_RANK[b.difficulty];
    if (difficultyDiff !== 0) return difficultyDiff;
    return a.priceZarPerKg.low - b.priceZarPerKg.low;
  });

  return { matches, dropped };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd landing && npm test`
Expected: PASS (all 8 tests).

- [ ] **Step 5: Add Selector-view styles**

Append to `landing/public/styles.css`:

```css
.selector-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  padding: 0 0 32px;
}

@media (max-width: 800px) {
  .selector-grid {
    grid-template-columns: 1fr;
  }
}

.selector-panel {
  border: 2px solid var(--ink);
  border-radius: 10px;
  padding: 24px;
  background: var(--surface-soft);
}

.selector-panel h2 {
  font-family: var(--font-serif);
  font-size: 18px;
  margin: 0 0 4px;
}

.selector-panel > p {
  font-size: 13px;
  color: var(--ink-muted);
  margin: 0 0 16px;
}

.chip-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.chip {
  border: 2px solid var(--ink);
  background: var(--surface);
  color: var(--ink);
  border-radius: 6px;
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.chip[aria-pressed="true"] {
  background: var(--color-terracotta);
  color: var(--color-cream);
}

.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0;
  border-top: 1px solid var(--surface);
  font-size: 14px;
  cursor: pointer;
}

.toggle-row__text {
  display: flex;
  flex-direction: column;
}

.toggle-row__desc {
  font-size: 12px;
  opacity: 0.75;
}

.toggle-row input[type="checkbox"] {
  width: 20px;
  height: 20px;
}

.capability-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.capability-tile {
  border: 2px solid var(--ink);
  border-radius: 8px;
  padding: 12px;
  cursor: pointer;
  background: var(--surface);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  text-align: left;
}

.capability-tile[aria-pressed="true"] {
  background: var(--color-terracotta);
  color: var(--color-cream);
  border-color: var(--color-terracotta);
}

.capability-tile__label {
  font-weight: 700;
  font-size: 13px;
  display: block;
  margin-bottom: 2px;
}

.capability-tile__desc {
  font-size: 12px;
  opacity: 0.85;
}

.best-match-card {
  border: 2px solid var(--color-olive);
  border-radius: 10px;
  padding: 24px;
  margin-bottom: 20px;
}

.best-match-card__name {
  font-family: var(--font-serif);
  font-size: 24px;
  margin: 0 0 8px;
}

.best-match-card__why {
  margin: 0 0 12px;
}

.best-match-card__price {
  font-size: 13px;
  color: var(--ink-muted);
}

.alternatives-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
  margin-bottom: 20px;
}

.alternative-name {
  font-family: var(--font-serif);
  margin: 4px 0 8px;
}

.not-recommended {
  border: 2px solid var(--ink);
  border-radius: 10px;
  padding: 16px 20px;
}

.not-recommended summary {
  cursor: pointer;
  font-weight: 700;
  list-style: none;
}

.not-recommended summary::-webkit-details-marker {
  display: none;
}

.not-recommended ul {
  margin: 12px 0 0;
  padding-left: 20px;
  font-size: 13px;
}
```

- [ ] **Step 6: Render the Selector view in materials.js**

Extend `landing/public/js/materials.js` — add near the existing
`import { MATERIALS } from './materials-data.js';` line:

```javascript
import { filterAndRank } from './materials-selector.js';
```

Then add the Selector view's state and rendering functions (everything
below still uses only `createElement`/`textContent`/`appendChild`):

```javascript
// ---- Selector view state ----
const CAPABILITY_TILES = [
  { key: 'outdoorUV', label: 'Outdoor / UV exposure', desc: 'Lives in the sun, rain or wind.' },
  { key: 'flexibility', label: 'Flexibility', desc: 'Must bend, stretch, grip or seal.' },
  { key: 'chemicalResistance', label: 'Chemical resistance', desc: 'Contact with fuels, solvents or cleaning agents.' },
  { key: 'foodContact', label: 'Food contact', desc: 'Touches food or drink (read the caveat below).' },
  { key: 'easyToPrint', label: 'Easy to print', desc: 'Want it to print first-time without tuning.' },
  { key: 'lowCost', label: 'Low cost', desc: 'Price per kilogram matters to the job.' },
  { key: 'smoothAppearance', label: 'Smooth appearance', desc: 'The part is seen, not hidden inside something.' },
  { key: 'highDimensionalAccuracy', label: 'High dimensional accuracy', desc: 'Press fits, threads, mating parts.' },
];

const printerProfile = {
  maxNozzleTempC: 260,
  maxBedTempC: 100,
  hasEnclosure: false,
  hasHardenedNozzle: false,
  hasDirectDrive: true,
};
const requiredCapabilities = {};

function renderLabeledStrong(container, text) {
  const p = document.createElement('p');
  const strong = document.createElement('strong');
  strong.textContent = text;
  p.appendChild(strong);
  container.appendChild(p);
  return p;
}

function renderPrinterPanel() {
  const panel = document.getElementById('selector-printer-panel');
  panel.textContent = '';

  const heading = document.createElement('h2');
  heading.textContent = 'Your printer';
  panel.appendChild(heading);

  const intro = document.createElement('p');
  intro.textContent = 'Start here — this rules more materials out than the requirements do.';
  panel.appendChild(intro);

  renderLabeledStrong(panel, 'Maximum nozzle temperature');
  const nozzleRow = document.createElement('div');
  nozzleRow.className = 'chip-row';
  for (const temp of [240, 260, 300, 350, 450]) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.textContent = `${temp} °C`;
    chip.setAttribute('aria-pressed', String(printerProfile.maxNozzleTempC === temp));
    chip.addEventListener('click', () => {
      printerProfile.maxNozzleTempC = temp;
      renderPrinterPanel();
      renderSelectorResults();
    });
    nozzleRow.appendChild(chip);
  }
  panel.appendChild(nozzleRow);

  renderLabeledStrong(panel, 'Maximum bed temperature');
  const bedRow = document.createElement('div');
  bedRow.className = 'chip-row';
  for (const temp of [60, 80, 100, 110, 160]) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.textContent = `${temp} °C`;
    chip.setAttribute('aria-pressed', String(printerProfile.maxBedTempC === temp));
    chip.addEventListener('click', () => {
      printerProfile.maxBedTempC = temp;
      renderPrinterPanel();
      renderSelectorResults();
    });
    bedRow.appendChild(chip);
  }
  panel.appendChild(bedRow);

  const toggles = [
    { key: 'hasEnclosure', label: 'Enclosed printer', desc: 'A closed chamber that holds heat in.' },
    { key: 'hasHardenedNozzle', label: 'Hardened nozzle', desc: 'Steel or ruby. Needed for anything filled.' },
    { key: 'hasDirectDrive', label: 'Direct-drive extruder', desc: 'Motor on the hotend rather than a bowden tube.' },
  ];
  for (const toggle of toggles) {
    const row = document.createElement('label');
    row.className = 'toggle-row';

    const textWrap = document.createElement('span');
    textWrap.className = 'toggle-row__text';
    const labelStrong = document.createElement('strong');
    labelStrong.textContent = toggle.label;
    const descSpan = document.createElement('span');
    descSpan.className = 'toggle-row__desc';
    descSpan.textContent = toggle.desc;
    textWrap.appendChild(labelStrong);
    textWrap.appendChild(descSpan);

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = printerProfile[toggle.key];
    input.addEventListener('change', () => {
      printerProfile[toggle.key] = input.checked;
      renderSelectorResults();
    });

    row.appendChild(textWrap);
    row.appendChild(input);
    panel.appendChild(row);
  }
}

function renderCapabilityPanel() {
  const panel = document.getElementById('selector-capability-panel');
  panel.textContent = '';

  const heading = document.createElement('h2');
  heading.textContent = 'What does the part need to do?';
  panel.appendChild(heading);

  const intro = document.createElement('p');
  intro.textContent = 'Tick everything that applies. Each one is pass or fail, not a preference — anything that can’t meet it gets dropped rather than shown further down the list.';
  panel.appendChild(intro);

  const grid = document.createElement('div');
  grid.className = 'capability-grid';
  for (const tile of CAPABILITY_TILES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'capability-tile';
    btn.setAttribute('aria-pressed', String(!!requiredCapabilities[tile.key]));

    const labelSpan = document.createElement('span');
    labelSpan.className = 'capability-tile__label';
    labelSpan.textContent = tile.label;
    const descSpan = document.createElement('span');
    descSpan.className = 'capability-tile__desc';
    descSpan.textContent = tile.desc;
    btn.appendChild(labelSpan);
    btn.appendChild(descSpan);

    btn.addEventListener('click', () => {
      requiredCapabilities[tile.key] = !requiredCapabilities[tile.key];
      renderCapabilityPanel();
      renderSelectorResults();
    });
    grid.appendChild(btn);
  }
  panel.appendChild(grid);
}

function renderSelectorResults() {
  const resultsEl = document.getElementById('selector-results');
  resultsEl.textContent = '';

  const { matches, dropped } = filterAndRank(window.__MATERIALS__, printerProfile, requiredCapabilities);

  if (matches.length === 0) {
    const empty = document.createElement('p');
    empty.textContent = 'Nothing matches this combination — loosen a printer requirement or untick a capability.';
    resultsEl.appendChild(empty);
  } else {
    const best = matches[0];
    const bestCard = document.createElement('div');
    bestCard.className = 'best-match-card';

    const eyebrow = document.createElement('p');
    eyebrow.className = 'eyebrow-label';
    eyebrow.textContent = 'Best match';
    bestCard.appendChild(eyebrow);

    const nameHeading = document.createElement('h3');
    nameHeading.className = 'best-match-card__name';
    nameHeading.textContent = best.name;
    bestCard.appendChild(nameHeading);

    const whyPara = document.createElement('p');
    whyPara.className = 'best-match-card__why';
    whyPara.textContent = best.whyChooseIt;
    bestCard.appendChild(whyPara);

    const pricePara = document.createElement('p');
    pricePara.className = 'best-match-card__price';
    pricePara.textContent = `R${best.priceZarPerKg.low}–R${best.priceZarPerKg.high}/kg${best.priceZarPerKg.estimated ? ' (est.)' : ''}`;
    bestCard.appendChild(pricePara);

    bestCard.appendChild(renderReqList(best));

    const findShopsBtn = document.createElement('button');
    findShopsBtn.type = 'button';
    findShopsBtn.className = 'btn btn--ghost';
    findShopsBtn.disabled = true;
    findShopsBtn.textContent = 'Find shops printing this — Coming soon';
    bestCard.appendChild(findShopsBtn);

    resultsEl.appendChild(bestCard);

    if (matches.length > 1) {
      const altGrid = document.createElement('div');
      altGrid.className = 'alternatives-grid';
      for (const alt of matches.slice(1, 4)) {
        const altCard = document.createElement('div');
        altCard.className = 'material-card';

        const altEyebrow = document.createElement('p');
        altEyebrow.className = 'eyebrow-label';
        altEyebrow.textContent = 'Alternative';
        altCard.appendChild(altEyebrow);

        const altName = document.createElement('h4');
        altName.className = 'alternative-name';
        altName.textContent = alt.name;
        altCard.appendChild(altName);

        altCard.appendChild(renderReqList(alt));
        altGrid.appendChild(altCard);
      }
      resultsEl.appendChild(altGrid);
    }
  }

  const notRecommended = document.createElement('details');
  notRecommended.className = 'not-recommended';
  const summary = document.createElement('summary');
  summary.textContent = `Not recommended (${dropped.length})`;
  notRecommended.appendChild(summary);

  const list = document.createElement('ul');
  for (const { material, reason } of dropped) {
    const li = document.createElement('li');
    const nameStrong = document.createElement('strong');
    nameStrong.textContent = material.name;
    li.appendChild(nameStrong);
    li.appendChild(document.createTextNode(` — ${reason}`));
    list.appendChild(li);
  }
  notRecommended.appendChild(list);
  resultsEl.appendChild(notRecommended);
}

function initSelectorView() {
  const container = document.getElementById('view-selector');
  container.textContent = '';

  const grid = document.createElement('div');
  grid.className = 'selector-grid';

  const printerPanel = document.createElement('div');
  printerPanel.className = 'selector-panel';
  printerPanel.id = 'selector-printer-panel';
  grid.appendChild(printerPanel);

  const capabilityPanel = document.createElement('div');
  capabilityPanel.className = 'selector-panel';
  capabilityPanel.id = 'selector-capability-panel';
  grid.appendChild(capabilityPanel);

  container.appendChild(grid);

  const results = document.createElement('div');
  results.id = 'selector-results';
  container.appendChild(results);

  renderPrinterPanel();
  renderCapabilityPanel();
  renderSelectorResults();
}

initSelectorView();
```

- [ ] **Step 7: Manual smoke test**

Visit `http://localhost:4100/materials.html`, Selector tab (default).
Confirm: changing nozzle/bed temp chips and toggles updates the result
set live, ticking a capability tile drops materials that don't satisfy
it, "Not recommended" expands to show real per-material reasons, "Best
match" and "Alternative" cards render with correct data.

- [ ] **Step 8: Commit**

```bash
cd landing
git add public/js/materials-selector.js public/js/materials.js public/styles.css tests/materialsSelector.test.js package.json
git commit -m "Add Materials Guide Selector view: printer/capability matching with tested filter logic"
```

---

### Task 7: Materials Guide — Head to head view

**Files:**
- Modify: `landing/public/js/materials.js`
- Modify: `landing/public/styles.css`

**Interfaces:**
- Consumes: `window.__MATERIALS__` (Task 5).

- [ ] **Step 1: Add compare-view styles**

Append to `landing/public/styles.css`:

```css
.compare-pickers {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 24px;
}

.compare-pickers select {
  font-family: var(--font-sans);
  font-size: 15px;
  padding: 10px 12px;
  border: 2px solid var(--ink);
  border-radius: 6px;
  background: var(--surface);
  color: var(--ink);
  min-width: 200px;
}

.compare-table {
  width: 100%;
  border-collapse: collapse;
  border: 2px solid var(--ink);
  border-radius: 10px;
  overflow: hidden;
}

.compare-table th,
.compare-table td {
  padding: 12px 16px;
  text-align: left;
  border-bottom: 1px solid var(--surface-soft);
  font-size: 14px;
}

.compare-table th {
  background: var(--surface-soft);
}

.compare-table td[data-winner="true"] {
  font-weight: 700;
  color: var(--color-olive);
}

.compare-empty {
  border: 2px solid var(--ink);
  border-radius: 10px;
  padding: 40px;
  text-align: center;
  color: var(--ink-muted);
}
```

- [ ] **Step 2: Render the compare pickers and table**

Extend `landing/public/js/materials.js` — add near the Selector-view
code. Every row's "which side wins" comparison reads from a small
lookup table returned by `row.rank()`, never calls that table as a
function — get this exactly right, it's the one place in this task with
real logic beyond DOM building:

```javascript
const compareState = { first: null, second: null };

const COMPARE_ROWS = [
  { label: 'Nozzle temperature', get: (m) => m.printerRequirements.nozzleTempC, unit: '°C', lowerIsBetter: false },
  { label: 'Bed temperature', get: (m) => m.printerRequirements.bedTempC, unit: '°C', lowerIsBetter: false },
  { label: 'Difficulty', get: (m) => m.difficulty, rank: () => ({ Beginner: 0, Intermediate: 1, Advanced: 2 }), lowerIsBetter: true },
  { label: 'Moisture sensitivity', get: (m) => m.moisture, rank: () => ({ Low: 0, Medium: 1, High: 2 }), lowerIsBetter: true },
  { label: 'Abrasive to nozzles', get: (m) => (m.abrasive ? 'Yes' : 'No'), lowerIsBetter: null },
  { label: 'Typical price (low end)', get: (m) => m.priceZarPerKg.low, unit: '/kg', prefix: 'R', lowerIsBetter: true },
];

function renderCompareOptions(selectEl) {
  selectEl.textContent = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Choose a material…';
  selectEl.appendChild(placeholder);

  for (const material of window.__MATERIALS__) {
    const opt = document.createElement('option');
    opt.value = material.id;
    opt.textContent = material.name;
    selectEl.appendChild(opt);
  }
}

function renderCompareResult() {
  const resultEl = document.getElementById('compare-result');
  resultEl.textContent = '';

  if (!compareState.first || !compareState.second) {
    const empty = document.createElement('div');
    empty.className = 'compare-empty';
    empty.textContent = 'Pick two materials to compare them side by side.';
    resultEl.appendChild(empty);
    return;
  }

  const a = window.__MATERIALS__.find((m) => m.id === compareState.first);
  const b = window.__MATERIALS__.find((m) => m.id === compareState.second);

  const table = document.createElement('table');
  table.className = 'compare-table';

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  const pointTh = document.createElement('th');
  pointTh.textContent = 'Point';
  const aTh = document.createElement('th');
  aTh.textContent = a.name;
  const bTh = document.createElement('th');
  bTh.textContent = b.name;
  headRow.appendChild(pointTh);
  headRow.appendChild(aTh);
  headRow.appendChild(bTh);
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const row of COMPARE_ROWS) {
    const tr = document.createElement('tr');
    const aVal = row.get(a);
    const bVal = row.get(b);
    const aCell = document.createElement('td');
    const bCell = document.createElement('td');
    aCell.textContent = `${row.prefix ?? ''}${aVal}${row.unit ?? ''}`;
    bCell.textContent = `${row.prefix ?? ''}${bVal}${row.unit ?? ''}`;

    if (row.lowerIsBetter !== null) {
      // row.rank(), when present, returns a { value: rankNumber } lookup
      // table — index into it, never call the result as a function.
      const lookup = row.rank ? row.rank() : null;
      const aRank = lookup ? lookup[aVal] : aVal;
      const bRank = lookup ? lookup[bVal] : bVal;
      if (aRank !== bRank) {
        const aWins = row.lowerIsBetter ? aRank < bRank : aRank > bRank;
        aCell.dataset.winner = String(aWins);
        bCell.dataset.winner = String(!aWins);
      }
    }

    const labelCell = document.createElement('th');
    labelCell.textContent = row.label;
    tr.appendChild(labelCell);
    tr.appendChild(aCell);
    tr.appendChild(bCell);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  resultEl.appendChild(table);

  const verdict = document.createElement('p');
  verdict.style.marginTop = '16px';
  verdict.textContent = `${a.name} needs a ${a.printerRequirements.nozzleTempC}°C nozzle and ${a.difficulty.toLowerCase()}-level printing; ${b.name} needs ${b.printerRequirements.nozzleTempC}°C and is ${b.difficulty.toLowerCase()}-level. Pick whichever's requirements your printer and skill level actually clear.`;
  resultEl.appendChild(verdict);
}

function initCompareView() {
  const container = document.getElementById('view-compare');
  container.textContent = '';

  const heading = document.createElement('h2');
  heading.style.fontFamily = 'var(--font-serif)';
  heading.textContent = 'Head to head';
  container.appendChild(heading);

  const intro = document.createElement('p');
  intro.style.color = 'var(--ink-muted)';
  intro.style.fontSize = '14px';
  intro.style.margin = '0 0 16px';
  intro.textContent = 'Pick two materials and see how they actually differ.';
  container.appendChild(intro);

  const pickers = document.createElement('div');
  pickers.className = 'compare-pickers';

  const firstSelect = document.createElement('select');
  firstSelect.id = 'compare-first';
  firstSelect.setAttribute('aria-label', 'First material');

  const vsSpan = document.createElement('span');
  vsSpan.textContent = 'vs';

  const secondSelect = document.createElement('select');
  secondSelect.id = 'compare-second';
  secondSelect.setAttribute('aria-label', 'Second material');

  pickers.appendChild(firstSelect);
  pickers.appendChild(vsSpan);
  pickers.appendChild(secondSelect);
  container.appendChild(pickers);

  const result = document.createElement('div');
  result.id = 'compare-result';
  container.appendChild(result);

  renderCompareOptions(firstSelect);
  renderCompareOptions(secondSelect);

  firstSelect.addEventListener('change', () => {
    compareState.first = firstSelect.value || null;
    renderCompareResult();
  });
  secondSelect.addEventListener('change', () => {
    compareState.second = secondSelect.value || null;
    renderCompareResult();
  });

  renderCompareResult();
}

initCompareView();
```

- [ ] **Step 3: Manual smoke test**

Visit the Head to head tab. Pick two materials via the dropdowns, confirm
the comparison table renders with a winner highlighted per objectively-
comparable row (price, difficulty, moisture), and the closing sentence
reads sensibly for at least 3 different material pairs.

- [ ] **Step 4: Commit**

```bash
cd landing
git add public/js/materials.js public/styles.css
git commit -m "Add Materials Guide Head to head comparison view"
```

---

### Task 8: Integration polish + docs

**Files:**
- Modify: `landing/public/index.html`, `pricing.html`, `materials.html` (consistency pass)
- Modify: `landing/README.md`
- Modify: `docs/AI_HANDOFF.md`, `README.md` (repo root)

**Interfaces:** none — this task only touches presentation consistency and docs, no new interfaces.

- [ ] **Step 1: Cross-page consistency pass**

Manually click through all 3 pages (light and dark mode, via the theme
toggle) and confirm: nav `aria-current="page"` is correct on each page,
identical header/footer markup across all 3 (no copy-paste drift),
mobile viewport (resize to ~375px width) doesn't break the nav or any
grid, no console errors on any page.

- [ ] **Step 2: Update landing/README.md**

Rewrite `landing/README.md` to describe the 3 real pages instead of the
old single coming-soon page — keep the "Run locally" and "Deploying to
the VPS" sections' substance, update the "What this is not" section to
point at this plan instead of the old landing-page-only design spec, and
add a line noting the two new `platform/api` public endpoints this site
now depends on (so a future reader knows `landing/` isn't fully
self-contained anymore).

- [ ] **Step 3: Update docs/AI_HANDOFF.md and README.md**

In `docs/AI_HANDOFF.md`'s state table, update the `landing/`/`barkie.co.za
(live domain)` row to describe the 3-page public site instead of "coming
soon", and add a line noting the Materials Guide dataset lives in
`landing/public/js/materials-data.js` and needs re-verification if
filament prices drift meaningfully. In the root `README.md`, update the
`landing/` row similarly.

- [ ] **Step 4: Run every test suite one more time**

```bash
cd landing && npm test
cd ../platform/api && npm test && npm run typecheck
cd ../platform/frontend && npm test
```
Expected: all green — this task shouldn't have touched anything covered
by the frontend or backend suites, so they're a pure regression check.

- [ ] **Step 5: Commit**

```bash
cd landing
git add public/index.html public/pricing.html public/materials.html README.md
cd ../..
git add docs/AI_HANDOFF.md README.md
git commit -m "Public site: cross-page consistency pass, update docs for the new 3-page landing site"
```

---

## After all tasks

Manual full smoke test (this is a public marketing site with a live-data
dependency and a real filtering algorithm — worth a real walkthrough, not
just "tests passed"):
1. Deploy `platform/api`'s two new public routes and `landing/`'s new
   pages together (they're interdependent — the stats/pricing pages will
   show broken/hidden state if only one side deploys).
2. Visit barkie.co.za, confirm Home/Pricing/Materials Guide all load,
   stats strip shows real (small, honest) numbers, pricing cards show
   real R25/R45/R70.
3. On the Materials Guide, run the Selector with at least 2 different
   printer profiles (a bare-minimum hobbyist setup and a fully-tricked-
   out one) and confirm the result sets genuinely differ and make sense.
4. Check mobile rendering on a real phone or the browser's device
   emulation, not just desktop.
