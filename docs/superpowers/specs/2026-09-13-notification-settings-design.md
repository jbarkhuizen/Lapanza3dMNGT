# Granular Notification Settings — Design Spec

**Source:** competitor reference screenshots ("Notifications" feed + "Settings" tabs) supplied by the user.

**Goal:** Per-tenant control over which notification categories fire, and whether each fires in-app, by email, or both — extending the notification system already shipped (backlog #27).

## Scope decision

The reference shows categories Barkie has no equivalent for yet: "Shop review" (no reviews feature), "Feature request completed" (feature-request board doesn't exist until a separate pass builds it), "Support reply/ticket status" (no support-ticket system). **Skip these three entirely** — do not add toggles for notification types that can never fire. Build settings only for categories that map to real, already-existing (or about-to-exist-in-this-same-spec) notification triggers:

- **Trial ending**, **Low stock**, **Invoice overdue** — already exist (`platform/api/src/notifications/checks.ts`).
- **Payment receipt**, **Subscription cancelled**, **Payment failed** — real subscription-webhook events (`platform/api/src/routes/webhooks.ts`) that currently update `Subscription.status` silently with no `Notification` row or email at all. This spec adds that.

Per the reference screenshot, billing-category rows show email as **"Always sent"** (not a toggle) — payment receipts/cancellations/failures are transactional and not opt-out-able by email. In-app is still toggleable for billing. Match that exactly: no `*Email` column for the three billing categories.

## Data model

New model in `platform/api/prisma/schema.prisma`:

```prisma
model NotificationPreference {
  id                         String   @id @default(uuid())
  tenantId                   String   @unique
  trialEndingInApp           Boolean  @default(true)
  trialEndingEmail           Boolean  @default(true)
  lowStockInApp              Boolean  @default(true)
  lowStockEmail              Boolean  @default(true)
  invoiceOverdueInApp        Boolean  @default(true)
  invoiceOverdueEmail        Boolean  @default(true)
  paymentReceiptInApp        Boolean  @default(true)
  subscriptionCancelledInApp Boolean  @default(true)
  paymentFailedInApp         Boolean  @default(true)
  createdAt                  DateTime @default(now()) @db.Timestamptz(3)

  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@map("notification_preferences")
}
```

Add `notificationPreference NotificationPreference?` inverse relation on `Tenant`.

## Backend

**`platform/api/src/db/scoped.ts`** — add a `notificationPreference` accessor: `get()` (returns the row or `null`), `getOrCreate()` (upsert with all-`true` defaults — mirrors the `companyProfile`/tenant-row-exists pattern already used elsewhere), `update(data)`.

**`platform/api/src/routes/notifications.ts`** — add:
- `GET /api/notification-preferences` — `requireTenantAuth, requireActiveSubscription`. Calls `getOrCreate()`, returns `{ ok: true, preferences }`.
- `PATCH /api/notification-preferences` — same middleware. zod schema: all 9 boolean fields, all `.optional()`. Updates via `getOrCreate()` then `update()`.

**`platform/api/src/notifications/checks.ts`** — before calling `createNotification()` in `checkTrialEnding`/`checkLowStock`/`checkInvoiceOverdue`, load the tenant's `NotificationPreference` (via `getOrCreate()`-equivalent direct prisma call, since this function iterates all tenants and isn't request-scoped) and skip the whole notification (no row, no email) if that category's `*InApp` is `false`; if `*InApp` is `true` but `*Email` is `false`, still create the row but skip the `mailer.sendMail()` call. Refactor `createNotification()`'s signature minimally to accept an `email: boolean` flag controlling whether it attempts the send (default `true`, so existing call sites without a preference lookup — there shouldn't be any left after this change — aren't silently broken).

**`platform/api/src/routes/webhooks.ts`** — in the three branches already inside the subscription-update function (`event.type === 'activated' || 'payment_succeeded'`, `'payment_failed'`, `'canceled'`), after each successful `prisma.subscription.update(...)`, look up (or create-if-missing) the tenant's `NotificationPreference`, and if the relevant `*InApp` flag is true, create a `Notification` row (`type: 'payment_received'` / `'payment_failed'` / `'subscription_cancelled'`, a plain message) and, if `mailer.isConfigured()`, send an email (no opt-out check needed for email — billing email is always-sent per the scope decision above). **Wrap this entire block in try/catch and never let it throw** — this function's job is to keep the payment provider's webhook contract intact (fast 200 response); do not add a code path that could turn a currently-working webhook into a 500. Do not touch any of the existing idempotency/race-guard logic already in this file — read the whole function first, add only after the existing `prisma.subscription.update()` calls, nothing in between.

## Frontend (`platform/frontend`)

**`platform/frontend/src/api/notifications.ts`** — extend with a `NotificationPreferences` interface (9 booleans) and `useNotificationPreferences()` / `useUpdateNotificationPreferences()` hooks.

**`platform/frontend/src/pages/notifications/NotificationSettingsPage.tsx`** (new) — grouped sections matching the reference layout: "Shop & Stock" (Trial ending, Low stock — wait, re-check: group as "Trials & Stock": Trial ending, Low stock; "Invoices": Invoice overdue; "Billing": Payment receipt, Subscription cancelled, Payment failed, each billing row showing "In-app" as a real toggle and "Email" as a disabled/static "Always sent" label, not a control). Two-column layout (In-app / Email) per the reference, `Checkbox`-style toggles for the real controls.

**`platform/frontend/src/App.tsx`** — route `/notification-settings` → `<NotificationSettingsPage />` inside `RequireAuth`.

**`platform/frontend/src/components/AppShell.tsx`** — add a "Settings" link from the existing notification-bell dropdown (added in backlog #27) to `/notification-settings` — read that dropdown's current markup first, add the link in the most natural spot (e.g. a footer row inside the dropdown panel) rather than adding a new top-level nav item, since this is a sub-setting of notifications, not a first-class section.

## Tests

- `platform/api/tests/notifications.test.ts` (extend): `GET`/`PATCH /api/notification-preferences` round-trip; `runNotificationChecks()` skips creating a notification entirely when `*InApp` is false for that category; creates the row but doesn't call `mailer.sendMail` when `*InApp` true / `*Email` false (spy on `mailer.sendMail`).
- `platform/api/tests/webhooks.test.ts` (extend, if this file exists — check; if webhook tests live elsewhere under a different filename, extend that instead): a `payment_succeeded` event creates a `payment_received`-type Notification when `paymentReceiptInApp` is true, and creates none when false; same for the `payment_failed`/`canceled` branches. Confirm the webhook still returns 200 even if notification creation is forced to throw (mock/stub to verify the try/catch actually swallows it).
- `platform/frontend/tests/NotificationSettingsPage.test.tsx` (new): toggles render and save correctly; billing rows show "Always sent" for email, not a checkbox.

## Global constraints

- Every route: `requireTenantAuth, requireActiveSubscription`, tenant-scoped.
- The webhook-notification addition must never change the webhook's HTTP response behavior or its existing race/idempotency guards — it is purely additive, wrapped defensively.
- No new dependency.
