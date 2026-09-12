# Team / Multi-User Accounts — Design Spec

**Source:** competitor reference screenshot ("Team — give staff their own sign-in... Sales can work with quotes, invoices, clients and the costing tools. Admins can additionally see the dashboard and manage shop settings, billing and the team.").

**This is the highest-risk item in this round — it touches `requireTenantAuth`, which every single resource route in the app depends on for tenant isolation.** Read this whole spec before writing any code, and re-read `platform/api/src/middleware/requireTenantAuth.ts`, `platform/api/src/auth/session.ts`, and `platform/api/src/routes/auth.ts`'s login handler (including the backlog #9 timing-safety fix — `DUMMY_PASSWORD_HASH` in `platform/api/src/auth/password.ts`) in full before touching any of them.

## Concept

A `Tenant` (the account owner) can invite `TeamMember`s who sign in independently (their own email/password) and act on the *same* tenant's data — fully tenant-scoped exactly like the owner today, with one added dimension: a `role` (`'admin' | 'sales'`) that gates a small set of owner-only areas. The `Session` model already stores a polymorphic `{ subjectType, subjectId }` (currently `'tenant' | 'platform_admin'`) — this feature adds a third subject type, `'team_member'`, using the exact same mechanism, not a new auth system.

## Data model

```prisma
model TeamMember {
  id                      String    @id @default(uuid())
  tenantId                String
  name                    String
  email                   String    @unique
  passwordHash            String?
  role                    String    @default("sales")
  active                  Boolean   @default(true)
  setPasswordToken        String?
  setPasswordTokenExpires DateTime? @db.Timestamptz(3)
  createdAt               DateTime  @default(now()) @db.Timestamptz(3)

  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@index([tenantId])
  @@map("team_members")
}
```

`email` is globally unique (matching `Tenant.email`'s own uniqueness) — login has no "which tenant" context to disambiguate a duplicate, so this avoids that ambiguity entirely, same reasoning as why `Tenant.email` is already `@unique`. `passwordHash` is nullable: an invited member has no password until they complete a set-password link (mirrors the existing tenant email-verification-token pattern in `auth.ts` — read `sendVerificationEmail`/the verify-email route for the token-expiry/consumption pattern to copy). Max **3 active team members per tenant** (matches the reference's "0 of 3 active members" cap) — enforce this in the invite route, not the schema.

Add `teamMembers TeamMember[]` inverse relation on `Tenant`.

## Auth changes — the risky part

**`platform/api/src/auth/session.ts`** — `createSession`'s `subjectType` parameter type becomes `'tenant' | 'platform_admin' | 'team_member'`. No other change needed here; it already stores whatever string it's given.

**`platform/api/src/middleware/requireTenantAuth.ts`** — currently: if `session.subjectType !== 'tenant'`, reject; else `req.tenantId = session.subjectId`. Change to: accept `'tenant'` OR `'team_member'`. For `'tenant'`, behavior is **unchanged** (`req.tenantId = session.subjectId`, and set a new `req.actorRole = 'admin'` — the owner is always full-admin). For `'team_member'`: look up the `TeamMember` by `session.subjectId`; if not found or `active === false`, reject exactly like an invalid session (401) — a deactivated member's existing session must stop working immediately, not just block new logins; set `req.tenantId = teamMember.tenantId` (the *owning* tenant, not the team member's own id — every existing tenant-scoped query keeps working unmodified because it only ever reads `req.tenantId`) and `req.actorRole = teamMember.role`. Add `actorRole?: 'admin' | 'sales'` to the Express `Request` type augmentation (find wherever `tenantId` was added to the Express namespace and add `actorRole` beside it).

**New `platform/api/src/middleware/requireAdminRole.ts`** — a middleware that runs *after* `requireTenantAuth` in a route chain (`router.get(path, requireTenantAuth, requireActiveSubscription, requireAdminRole, handler)`) and 403s with `{ ok: false, error: 'Only an account admin can do this.' }` if `req.actorRole !== 'admin'`.

**`platform/api/src/routes/auth.ts`'s login handler** — currently looks up `Tenant` by email, and (per backlog #9) always runs a real bcrypt compare even when no tenant matches, against `DUMMY_PASSWORD_HASH`, to keep response timing constant. Extend to: if no `Tenant` matches the email, look up an **active** `TeamMember` by email instead before falling back to the dummy-hash compare — so the constant-time property still holds across all three outcomes (unknown email, wrong password, right password), not just the original two. On a successful team-member login, `createSession('team_member', teamMember.id)`. **Do not weaken or remove the existing dummy-hash timing protection** — extend it to cover the new lookup path, don't bypass it.

**`platform/api/src/routes/auth.ts`'s `GET /api/auth/me`** (or wherever the current-session info is returned — check the exact route name) — extend the response to include `actorRole` and, when logged in as a team member, `actorName`/`actorEmail` distinct from the tenant's own `businessName`/`email`, so the frontend can show "Signed in as {name} (Sales)" when relevant.

## Team management routes

**`platform/api/src/routes/team.ts`** (new router):
- `GET /api/team` — `requireTenantAuth, requireActiveSubscription, requireAdminRole`. Lists this tenant's `TeamMember`s.
- `POST /api/team/invite` — same middleware. Body: `name`, `email`, `role`. 400 if already at 3 active members. Creates a `TeamMember` with `passwordHash: null`, a `setPasswordToken` (crypto-random, same generation style as the existing email-verification token) + expiry, and emails a set-password link (reuse `mailer`/the existing verification-email send pattern — gated by `mailer.isConfigured()` exactly like every other transactional email in this codebase; if unconfigured, the invite still succeeds, matching how `POST /api/auth/register` already tolerates a failed verification-email send).
- `POST /api/team/set-password` — **no auth required** (the invitee has no session yet) — body `{ token, password }`. Validates the token/expiry, hashes the password, sets `passwordHash`, clears the token fields.
- `PATCH /api/team/:id` — `requireAdminRole`. Body: `{ active?: boolean, role?: string }` — deactivating immediately invalidates that member's ability to pass `requireTenantAuth` (already true given the middleware change above re-checks `active` on every request, not just at login).
- `DELETE /api/team/:id` — `requireAdminRole`. Hard-deletes the row (also delete any `Session` rows for that member so a still-valid token can't be reused — check whether `Session` deletion needs to happen explicitly here or if `requireTenantAuth`'s active-check already makes this moot; if the row is gone entirely, `TeamMember.findUnique` returns null and the auth check already rejects it the same as `active: false`, so this may not need special handling — verify, don't assume).

## Gate the owner-only areas

Apply `requireAdminRole` (after the existing `requireTenantAuth, requireActiveSubscription`) to: `GET/PATCH /api/company-profile`, `GET/PATCH /api/shop-profile`, everything in `platform/api/src/routes/billing.ts`, everything in the new `team.ts` router (already specified above), and `GET /api/reports/dashboard` + `GET /api/reports/summary` (per the reference: "Admins can additionally see the dashboard"). **Leave every other existing route ungated by role** — quotes, invoices, customers, costing-templates, materials, jobs, job-cards, notifications stay open to both roles, per the reference's own description of what Sales can do.

## Frontend (`platform/frontend`)

**`platform/frontend/src/context/AuthContext.tsx`** — extend whatever this currently exposes with `actorRole` (from the extended `/api/auth/me` response).

**`platform/frontend/src/components/AppShell.tsx`** — hide the Dashboard, Company Profile, Shop Profile, Billing, and (new) Team nav items when `actorRole !== 'admin'`; show a small "Signed in as {name}" line when acting as a team member (distinct from the tenant's own business name).

**`platform/frontend/src/pages/team/TeamPage.tsx`** (new) — list of members with role/active state, an "Add member" button (name/email/role form), deactivate/reactivate/delete actions. Only reachable by admins (route-guard the same way other admin-only pages would be — check if `RequireAuth` already supports a role requirement or if this needs its own lightweight wrapper).

**`platform/frontend/src/pages/team/SetPasswordPage.tsx`** (new, **no auth required** — a public route) — reads a `?token=` query param, a password + confirm-password form, calls `POST /api/team/set-password`, redirects to login on success.

**`platform/frontend/src/App.tsx`** — routes `/team` (admin-gated, inside `RequireAuth`) and `/set-password` (public, outside `RequireAuth` — check how `/login` itself is structured for the public-route pattern to mirror).

## Tests

This is the one area of this round where test coverage matters more than usual — auth bugs are severe.

- `platform/api/tests/auth.test.ts` (extend): team-member login succeeds with correct role in session; a deactivated member cannot log in even with the correct password; an existing session for a member deactivated *mid-session* is rejected on the very next request (not just at next login) — this is the test that actually proves the security property, write it carefully; the timing-safety test from backlog #9 still passes for the three-way lookup (unknown email / wrong tenant password / wrong team-member password all take the equivalent code path).
- `platform/api/tests/team.test.ts` (new): invite/list/deactivate/delete cycle; the 3-member cap is enforced; `set-password` works and expires correctly; a `'sales'`-role session gets 403 from `company-profile`/`billing`/`team` routes but 200 from `customers`/`quotes`; an `'admin'`-role team member (not just the owner) also passes `requireAdminRole`.
- `platform/api/tests/tenant-isolation.test.ts` (extend): a team member for tenant A cannot access tenant B's data via any route (same shape as every other resource's isolation test in this file).
- `platform/frontend/tests/AppShell.test.tsx` (extend): nav hides admin-only items for a `'sales'` actor.
- `platform/frontend/tests/TeamPage.test.tsx` / `SetPasswordPage.test.tsx` (new).

## Global constraints

- `req.tenantId` semantics do not change for any existing route — every current resource router keeps working with zero modification, because a team member's requests resolve to the *owning tenant's* id.
- Never let a role check alone stand in for tenant scoping — `requireAdminRole` only decides "can this actor touch admin-only routes," `requireTenantAuth` still does 100% of the "which tenant's rows" job everywhere, unchanged.
- Do not regress the backlog #9 timing-safety property.
