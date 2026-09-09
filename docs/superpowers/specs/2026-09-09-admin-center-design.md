# Admin Center — Design Spec

**Status:** Approved 2026-09-09. Implements backlog item #26. First real use
of the `PlatformAdmin` model and `Session.subjectType = 'platform_admin'` —
both existed unused in the schema since the very first migration
(`20260906175410_init`), scaffolded for exactly this feature and never wired
to a route, middleware, or UI.

## Goal

A single trusted operator (the Barkie owner) needs a real way to do the
support/ops tasks that have so far required raw SQL against `barkie_prod`:
look at who's signed up, fix a tenant's own record, see what they've quoted/
invoiced when something goes wrong, manually grant or adjust a subscription
for a support case, and edit `Plan` pricing without a `psql` session. This
spec covers exactly those things — nothing else.

## Decisions already made (not open for re-litigation in this spec)

- **Scope**: tenant list; tenant detail (edit email/business name/contact
  name, view their quotes/invoices read-only); subscription management
  (manually grant/adjust/cancel); Plan management (edit + create). A link out
  to `landing/`'s existing `/admin/signups` Basic-Auth view for the old
  coming-soon-page email captures — not rebuilt or merged in, just linked.
- **Explicitly out of scope**: 2FA, notifications, newsletter, reports/
  history dashboard (separate Phase 2 items per the original Phase 1 design
  spec's roadmap — "admin center" is one line item among several, not all of
  them); multiple admin accounts/roles/permissions (single trusted operator);
  public self-registration for admin accounts (severe security risk — the
  first, and likely only, admin account is created by a one-off script run
  directly on the server, never an HTTP endpoint).
- **Architecture**: server-rendered HTML pages (plain forms, no client JS,
  no build step) in a new router inside `platform/api` — not a new section
  of the `platform/frontend` React SPA. Chosen for speed given the current
  build pace; the existing `landing/server.js` `/admin/signups` view is the
  precedent for "simple internal server-rendered admin view," but this one
  queries the real Postgres/Prisma data `platform/api` already has, not a
  separate SQLite database.
- **Mount point**: `app.use('/api/admin', adminRouter)` inside `platform/api`
  — reachable at `https://barkie.co.za/api/admin/...` through the *existing*
  nginx `/api/` proxy rule. No nginx config change, no new deploy step,
  zero infra risk. (A prettier `barkie.co.za/admin/...` URL would need a new
  nginx `location` block routing to port 4200; deliberately not doing that
  for this phase.) The path-scoped mount is also the first place in this
  codebase to use the structural fix its own past whole-branch reviews
  recommended for the "unpathed `router.use()` intercepts everything mounted
  after it" bug class (hit three times in the billing/subscription phase) —
  `adminRouter`'s own auth middleware can only ever apply to `/api/admin/*`
  requests, by construction, regardless of where it's registered relative to
  other routers.
- **Auth reuses the existing scaffolding exactly as designed**: real login
  (email + `bcryptjs`-hashed password against `PlatformAdmin.passwordHash`,
  same `hashPassword`/`verifyPassword` helpers tenant auth already uses),
  `createSession('platform_admin', admin.id)` (the call this function's type
  signature has allowed since day one and nothing has ever used), the *same*
  session cookie (`env.sessionCookieName`) tenant auth uses — disambiguated
  server-side by `Session.subjectType`, not by a separate cookie name. This
  means logging in as a tenant and logging in as platform-admin in the same
  browser overwrite each other's session — expected behavior given this is
  one operator, not a bug to fix.

## Data model

**No schema changes.** `PlatformAdmin` (`schema.prisma`) already has
everything needed: `id`, `email` (unique), `passwordHash`, `createdAt`.

## The `paymentProvider`/`providerSubscriptionId` interaction (read before implementing subscription management)

Traced directly against the current billing code
(`platform/api/src/routes/billing.ts`) before writing this spec, not
assumed:

- The cancel route (`POST /api/billing/cancel`) only calls
  `providers[subscription.paymentProvider]` when
  `subscription.providerSubscriptionId` is set — a subscription with no
  `providerSubscriptionId` takes the "cancel locally only" branch and never
  reaches that lookup.
- The resubscribe path (inside `POST /api/billing/checkout`) has the
  identical guard shape before its own `providers[existing.paymentProvider]`
  lookup.

Both lookups are unguarded for an unrecognized `paymentProvider` value
(a real, already-filed Minor from the billing phase's final review) — but
neither is *reachable* for a row with `providerSubscriptionId: null`.

**Consequence for this spec**: an admin-granted subscription must be created
with `paymentProvider: 'manual'` and `providerSubscriptionId: null`. With
those two values, the tenant-facing checkout/cancel routes already treat it
exactly like a PayFast trial that never got its first ITN — safe, by the
existing code's own design, no changes to `billing.ts` needed. If an admin
later needs to cancel a *real* (PayFast/PayPal-backed) subscription through
this admin center, that row already has a real `paymentProvider` and
`providerSubscriptionId` from its real signup — the admin center's cancel
action should call the exact same tenant-facing cancel logic (or reuse
`scoped.subscription.updateStatus`/the real provider's `cancelSubscription`
the same way `billing.ts` does), not bypass it.

## Pages

All server-rendered HTML, all behind `requirePlatformAdminAuth` except
`/api/admin/login`. Forms POST with `application/x-www-form-urlencoded`
(already globally parsed via `express.urlencoded()`), no client JS.

1. **`GET /api/admin/login`** — email + password form. No auth required
   (obviously). Rate-limited like tenant login (`loginLimiter`'s same
   shape: 10/hour) — this is the single highest-value login target in the
   whole app, since it grants access to every tenant's data.
2. **`POST /api/admin/login`** — verify against `PlatformAdmin`, set the
   session cookie (`httpOnly`, `sameSite: 'lax'`, `secure` in production —
   identical attributes to tenant login), redirect to `/api/admin/tenants`.
3. **`POST /api/admin/logout`** — destroy the session, redirect to login.
4. **`GET /api/admin/tenants`** — table: business name, email, signup date,
   email-verified yes/no, subscription status (or "none"). Each row links
   to its detail page. Sorted newest-first.
5. **`GET /api/admin/tenants/:id`** — tenant detail:
   - An edit form for `businessName`/`contactName`/`email` (direct
     `prisma.tenant.update`, no re-verification flow triggered by an email
     change — this is an admin support action, not the tenant's own
     self-service change).
   - Subscription section: current status/plan/trial-end/period-end if a
     subscription exists, with:
     - A "grant subscription" form (pick a `Plan`, sets
       `status: 'active'`, `paymentProvider: 'manual'`,
       `providerSubscriptionId: null`, `trialEndsAt: now` (already elapsed —
       there's no real trial to track for a comped account),
       `currentPeriodEnd: now + 30 days`, matching what a real subscription
       looks like immediately after its first successful webhook) shown
       when the tenant has no subscription or a `canceled`/`lapsed` one.
     - An "adjust" form shown when a subscription exists — a `<select>`
       over the exact 5 real status values (`trialing`, `active`,
       `past_due`, `lapsed`, `canceled` — the same set
       `requireActiveSubscription.ts` and the webhook handler already use)
       plus a date input to extend `currentPeriodEnd`. This is a direct
       field edit for support cases (e.g. a tenant whose webhook got lost
       and is stuck `past_due` despite having paid), not a
       re-implementation of the billing state machine.
     - A "cancel" action that reuses the exact same logic
       `POST /api/billing/cancel` uses (real provider call if
       `providerSubscriptionId` is set, local-only otherwise) — do not
       duplicate that logic, extract/reuse it if it isn't already in a
       shape both routes can call.
   - Links to `/api/admin/tenants/:id/quotes` and
     `/api/admin/tenants/:id/invoices`.
6. **`GET /api/admin/tenants/:id/quotes`** — read-only table of that
   tenant's quotes (number, customer, status, total, date). No edit
   actions — this is for support visibility ("why isn't my invoice showing
   as paid"), not a back-door editing surface for tenant business data.
7. **`GET /api/admin/tenants/:id/invoices`** — same, for invoices.
8. **`GET /api/admin/plans`** — table of all `Plan` rows (name, price,
   sortOrder, active) each with an inline edit form, plus a "create new
   plan" form at the bottom. This directly replaces the "change a price
   with a direct DB `UPDATE`" workflow documented in `AI_HANDOFF.md` and
   the billing design spec.
9. **`GET /api/admin` (dashboard/home)** — short nav linking to Tenants,
   Plans, and an external link to `https://barkie.co.za/admin/signups`
   (the existing `landing/` view, opens separately, still its own
   Basic-Auth gate).

## Bootstrapping the first admin account

A one-off script (`platform/api/scripts/create-admin.ts` or similar),
run manually on the VPS via `npx tsx scripts/create-admin.ts <email> <password>`
— hashes the password with the existing `hashPassword` helper and inserts a
`PlatformAdmin` row directly via Prisma. Never an HTTP-reachable endpoint.
Document the exact command in `AI_HANDOFF.md`'s deploy section once built.

## What this spec does NOT cover

- 2FA, notifications, newsletter opt-in, reports/history dashboard — all
  separate Phase 2 roadmap items, not "admin center."
- Multiple admin accounts, roles, or permission levels.
- Any change to `platform/frontend` (the tenant-facing SPA) or to
  `landing/`'s existing `/admin/signups` view (linked to, not touched).
- Any change to `platform/api/src/routes/billing.ts`'s actual logic — the
  admin center's subscription actions are designed to stay compatible with
  it as-is, per the traced interaction above, not to modify it.
