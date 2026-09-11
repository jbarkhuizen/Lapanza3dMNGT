# Notifications & Reports Dashboard — Design Spec

**Backlog:** #27 — "Notifications, newsletter & reports dashboard" — **newsletter is explicitly out of scope** (Mailchimp/third-party integration was deferred, not requested for this phase). This spec covers only the notification system and the reports dashboard.

**Goal:** A tenant gets notified (in-app + email) about trial expiry, low stock, and overdue invoices, and has a single Reports page summarizing their business at a glance.

## Data model

New model in `platform/api/prisma/schema.prisma`:

```prisma
model Notification {
  id                String    @id @default(uuid())
  tenantId          String
  type              String
  message           String
  relatedEntityType String?
  relatedEntityId   String?
  readAt            DateTime? @db.Timestamptz(3)
  createdAt         DateTime  @default(now()) @db.Timestamptz(3)

  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@index([tenantId])
  @@map("notifications")
}
```

`type` values: `"trial_ending"`, `"low_stock"`, `"invoice_overdue"` (plain string, matching how `status` fields are modeled everywhere else in this schema — not a Prisma enum). `relatedEntityType`/`relatedEntityId` let the frontend link a notification to the thing it's about (`"filament"`/`"consumable"`/`"invoice"` + that row's id) without a hard foreign key (the related row's table varies).

Add the inverse `notifications Notification[]` relation field on `Tenant` in the same migration.

## Notification generation — a scheduled check, not real-time triggers

Each condition below is evaluated by a periodic check, not by hooking into the create/update code paths of trials, stock, or invoices — a scheduled sweep is simpler, and it naturally handles "this has been true for a while and nobody's looked at it," which is the actual failure mode worth catching (a stock level that silently crossed the threshold three days ago is exactly as urgent whether or not anyone touched that Consumable row since).

**`platform/api/src/notifications/checks.ts`** (new) — exports `async function runNotificationChecks(): Promise<void>` that, for every tenant:
1. **Trial ending**: `Subscription` rows with `status: 'trialing'` and `trialEndsAt` within the next 3 days. Dedupe: skip if a `Notification` with `type: 'trial_ending'` for this tenant already exists with `createdAt` in the last 24h (don't re-notify every run).
2. **Low stock**: `Filament` rows where `remainingWeightGrams` and `lowStockThresholdGrams` are both non-null and `remainingWeightGrams <= lowStockThresholdGrams`; `Consumable` rows where `reorderThreshold` is non-null and `currentStock <= reorderThreshold`. Same 24h dedupe per specific entity (`relatedEntityType` + `relatedEntityId`), not per tenant — a tenant with three low-stock filaments should get three notifications, but not three-per-day-each.
3. **Invoice overdue**: `Invoice` rows where `status` is `'unpaid'` or `'partially_paid'` and `dueDate < now`. This is informational only — it does **not** change the invoice's `status` to `'overdue'`; that transition stays the tenant's own manual action via the existing "Mark as Overdue" button (`platform/frontend/src/pages/invoices/InvoiceDetailPage.tsx`). Same per-entity 24h dedupe as low stock.

For each new condition found: `prisma.notification.create(...)` and, if `mailer.isConfigured()` (from `platform/api/src/lib/mailer.ts`, same gate `sendDocumentEmail`/`sendVerificationEmail` already use), also email the tenant via `mailer.sendMail({ to: tenant.email, subject: ..., text: message })` — wrap the email send in try/catch exactly like `POST /api/auth/register`'s verification-email send does, so a transient SMTP failure never blocks the in-app notification from being created.

**`platform/api/src/notifications/scheduler.ts`** (new) — `export function startNotificationScheduler()`: `setInterval(() => { runNotificationChecks().catch((err) => console.error('notification check failed', err)); }, 24 * 60 * 60 * 1000)`, plus an immediate first run on startup. **Call this only from `platform/api/src/server.ts`, after `app.listen(...)`, never from `buildApp()`** — `buildApp()` is called directly by nearly every test file in `platform/api/tests/`, and a live `setInterval` started on every test's app instance would leak timers across the whole suite and likely cause exactly the kind of cross-test interference this codebase has already hit once this session with stray processes.

## Backend routes

**`platform/api/src/routes/notifications.ts`** (new router, mounted in `app.ts`):
- `GET /api/notifications` — `requireTenantAuth, requireActiveSubscription`. Optional `?unreadOnly=true`. Returns `{ ok: true, notifications: [...] }`, newest first.
- `PATCH /api/notifications/:id/read` — same middleware. Sets `readAt: new Date()` via the `updateMany`-then-refetch tenant-scoped pattern (like `Job`/`Customer` above); 404 if not found for this tenant. `200 { ok: true, notification: {...} }`.
- `POST /api/notifications/mark-all-read` — same middleware. `updateMany({ where: { tenantId, readAt: null }, data: { readAt: new Date() } })`. `200 { ok: true, count: <n> }`.

**`platform/api/src/db/scoped.ts`** — add a `notifications` accessor: `findMany(unreadOnly?)`, `markRead(id)`, `markAllRead()` — same shape/conventions as the rest of this file.

**`platform/api/src/routes/reports.ts`** (new router):
- `GET /api/reports/summary` — `requireTenantAuth, requireActiveSubscription`. One aggregation query set, tenant-scoped throughout:
  - `totalRevenue`: sum of `total` across `Invoice` rows with `status: 'paid'` (use `prisma.invoice.aggregate({ where: { tenantId, status: 'paid' }, _sum: { total: true } })`, format the Decimal result with `.toFixed(2)`, `'0.00'` if null).
  - `openQuotesCount`: `Quote` rows with `status` in `['draft', 'sent']` (the two non-terminal states — see `platform/api/src/routes/quotes.ts`'s `VALID_QUOTE_STATUS_TRANSITIONS` map: the full set is `draft`/`sent`/`accepted`/`expired`, no `rejected`).
  - `overdueInvoices`: `Invoice` rows where `status` is `'unpaid'`/`'partially_paid'` and `dueDate < now` — same condition as the notification check above, factor the query into a small shared helper both this route and `checks.ts` can call if that's natural, but don't over-engineer a shared abstraction for two call sites if it doesn't fall out cleanly.
  - `lowStockItems`: the same Filament/Consumable condition as the notification check, combined into one list with a `kind: 'filament' | 'consumable'` discriminator.
  - `jobsInProgress`: count of `Job` rows (backlog #23 — this table will exist by the time this feature is built, since #23 is being implemented before #27) with `status` not in `['backlog', 'done']`.
  - Response shape: `{ ok: true, totalRevenue, openQuotesCount, overdueInvoices: [...], lowStockItems: [...], jobsInProgress }`.

## Frontend (`platform/frontend`)

**`platform/frontend/src/api/notifications.ts`** (new) — `Notification` interface, `useNotifications(unreadOnly?)`, `useMarkNotificationRead(id)`, `useMarkAllNotificationsRead()`.

**`platform/frontend/src/api/reports.ts`** (new) — `ReportsSummary` interface matching the route's response shape, `useReportsSummary()`.

**`platform/frontend/src/components/AppShell.tsx`** — add a notification bell to the header (next to the existing subscription-status banner area): an icon button showing the unread count (from `useNotifications(true)`), opening a small dropdown list of recent notifications (message + relative time), each clickable to mark read and navigate to `relatedEntityType`/`relatedEntityId` if present (e.g. a `low_stock` notification for a filament links to `/filaments/{id}`). Keep this simple — a dropdown panel, not a full separate notifications page, matching how most SaaS dashboards surface this.

**`platform/frontend/src/pages/reports/ReportsPage.tsx`** (new) — a handful of summary cards (Total Revenue, Open Quotes, Jobs In Progress) plus two lists (Overdue Invoices, Low Stock Items), each list item linking to the relevant detail page. No charts, no date-range picker — this phase is an overview, not analytics; don't add a charting library.

**`platform/frontend/src/App.tsx`** — route `/reports` → `<ReportsPage />` inside `RequireAuth`.

**`platform/frontend/src/components/AppShell.tsx`** — add `{ to: '/reports', label: 'Reports' }` to `NAV_ITEMS`.

## Tests

- `platform/api/tests/notifications.test.ts` (new): auth required on all three routes; `runNotificationChecks()` (imported directly, not via HTTP) creates a `trial_ending` notification for a trialing subscription within 3 days of `trialEndsAt` and does not for one 10 days out; creates `low_stock` notifications for both a Filament and a Consumable crossing their thresholds; creates `invoice_overdue` for a past-due unpaid invoice and does **not** mutate that invoice's `status`; running the check twice in a row does not create duplicate notifications within the same 24h window; `PATCH /:id/read` and `POST /mark-all-read` work and are tenant-isolated.
- `platform/api/tests/reports.test.ts` (new): auth required; summary numbers match fixture data (a paid invoice, an open quote, a low-stock filament, an overdue invoice, an in-progress job) built directly via Prisma in the test.
- `platform/frontend/tests/ReportsPage.test.tsx` (new): renders summary data from a mocked `apiGet`.
- `platform/frontend/tests/AppShell.test.tsx` (extend): the notification bell shows the unread count and the dropdown lists notifications; clicking one calls the mark-read mutation.

## Global constraints

- Every new route carries `requireTenantAuth, requireActiveSubscription`.
- Every DB access is tenant-scoped through `tenantScope(req.tenantId!)` — `runNotificationChecks()` itself iterates tenants (it has no single `req.tenantId`, so it necessarily queries across tenants at the top level), but every write it makes still sets the correct `tenantId` per row it's acting on; it never leaks one tenant's data into another's notification.
- `mailer.isConfigured()` gates every notification email exactly like it already gates `sendVerificationEmail`/`sendDocumentEmail` — never an `env.nodeEnv` check.
- `startNotificationScheduler()` is called only from `server.ts`, never from `buildApp()` or any test.
