# Real Dashboard + List-Page Stat Panels — Design Spec

**Source:** competitor reference screenshots (Dashboard, Clients, Invoices, Quotes pages) supplied by the user. Not a numbered backlog item — direct request.

**Goal:** Replace the bare `DashboardHomePage` stub with a real overview, and add a summary-stat row to the top of the Customers/Invoices/Quotes list pages, matching the reference screenshots' content (not their dark-purple visual style — keep Barkie's own existing Tailwind look, fonts, and card conventions throughout).

## Backend

**`platform/api/src/routes/reports.ts`** already computes `totalRevenue`, `openQuotesCount`, `overdueInvoices`, `jobsInProgress` for a tenant (see the file as it exists today). Add one new route to the same router:

`GET /api/reports/dashboard` — `requireTenantAuth, requireActiveSubscription`. Returns:
- `openInvoicesCount`: `prisma.invoice.count({ where: { tenantId, status: { in: ['unpaid', 'partially_paid'] } } })`
- `openQuotesCount`: reuse the same query already in `/api/reports/summary` (`status: { in: ['draft', 'sent'] }`)
- `paidInvoicesCount`: `prisma.invoice.count({ where: { tenantId, status: 'paid' } })`
- `revenueThisMonth`: `prisma.invoice.aggregate({ where: { tenantId, status: 'paid', createdAt: { gte: <first of current month> } }, _sum: { total: true } })`, formatted `.toFixed(2)`, `'0.00'` if null
- `invoiceStatusCounts`: `{ paid, unpaid, overdue }` — three counts via `prisma.invoice.groupBy({ by: ['status'], where: { tenantId }, _count: true })`, mapped into an object (treat `partially_paid` as `unpaid` for this rollup — don't add a 4th bucket, the reference screenshot only shows three)
- `convertedQuotesCount`: `prisma.quote.count({ where: { tenantId, status: 'accepted' } })`

Response shape: `{ ok: true, revenueThisMonth, openInvoicesCount, openQuotesCount, paidInvoicesCount, invoiceStatusCounts: { paid, unpaid, overdue }, convertedQuotesCount }`.

**`platform/api/src/routes/customers.ts`** — add `GET /api/customers/stats` (`requireTenantAuth, requireActiveSubscription`, placed before the `/:id` routes so it isn't shadowed). Returns `{ ok: true, totalClients, outstanding, withOverdue }`:
- `totalClients`: `prisma.customer.count({ where: { tenantId } })`
- `outstanding`: sum of `(invoice.total - invoice.amountPaid)` across that tenant's non-paid invoices — compute in JS after `prisma.invoice.findMany({ where: { tenantId, status: { not: 'paid' } }, select: { total: true, amountPaid: true } })` and summing Decimal-safe (use the existing `Prisma.Decimal` import pattern already used in `invoices.ts`), `.toFixed(2)`
- `withOverdue`: count of **distinct customers** who have at least one row matching `overdueInvoiceWhere(tenantId)` (import that helper from `../notifications/checks.js`) — group the overdue invoices by `customerId` and count unique ids, don't just count invoices

No schema changes anywhere in this spec — every number is derived from existing tables.

## Frontend

**`platform/frontend/src/api/reports.ts`** — extend with a `DashboardSummary` interface and `useDashboardSummary()` hook (`GET /api/reports/dashboard`).

**`platform/frontend/src/pages/DashboardHomePage.tsx`** — replace the stub entirely:
- Heading: `Welcome back, {tenant?.businessName}` (existing tone, don't literally copy "Welcome Back, {name}!" styling from the reference — match Barkie's own heading conventions elsewhere, e.g. `CompanyProfilePage.tsx`'s `<h1>`).
- A stat-card row (reuse whatever card/grid pattern `ReportsPage.tsx` already established for its summary cards — read that file first and match it exactly rather than inventing new markup): Open Invoices, Open Quotes, Paid Invoices, Revenue This Month.
- Below that, an "Invoice status" panel: three rows (Paid / Unpaid / Overdue) each showing a count and a simple percentage-width bar (`width: ${count/total*100}%` inline style is fine, no charting library) — `0%`/empty bar when `invoiceStatusCounts` are all zero, don't divide by zero.
- A "Converted quotes" stat (count) alongside or below the invoice-status panel.
- Loading/error states matching `ReportsPage.tsx`'s existing pattern.

Do **not** build the "Listing engagement" panel (website referrals / profile visits / directions / Google reviews) from the reference screenshot — Barkie's shop-profile page has no visit-tracking infrastructure, and adding analytics collection is a materially separate feature not requested here. Skip it entirely; don't stub it with fake zeros either.

**`platform/frontend/src/api/customers.ts`** — add a `CustomerStats` interface (`totalClients: number`, `outstanding: string`, `withOverdue: number`) and `useCustomerStats()` hook.

**`platform/frontend/src/pages/customers/CustomersListPage.tsx`** — read this file first for its current top-of-page structure, then add a 3-stat row above the existing list/table (Total Clients, Outstanding — formatted with `formatCurrency` from `platform/frontend/src/lib/formatCurrency.ts`, With Overdue), styled consistently with whatever stat-card pattern you used on the Dashboard page (share a small component between the two if that falls out naturally — e.g. a `StatCard`/`StatRow` component in `platform/frontend/src/components/` — but don't force an abstraction if the two layouts end up different enough that sharing one component would need awkward props).

**`platform/frontend/src/pages/invoices/InvoicesListPage.tsx`** — add a 5-stat row: Total Outstanding (sum of `total - amountPaid` across non-paid invoices, same computation style as the customers-stats backend route — you'll need a small backend addition for this: extend `GET /api/invoices` or add `GET /api/invoices/stats` mirroring the customers-stats pattern, tenant-scoped, no schema change), Total Paid (sum of paid invoices' totals), Paid count, Unpaid count (include `partially_paid` in this bucket), Overdue count.

**`platform/frontend/src/pages/quotes/QuotesListPage.tsx`** — add a 4-stat row: Total Quotes (count), Total Value (sum of all quotes' `total`), Expired count, Converted count (`status: 'accepted'`) — same pattern, add `GET /api/quotes/stats` mirroring the others.

## Tests

- `platform/api/tests/reports.test.ts` (extend): `GET /api/reports/dashboard` returns correct counts/sums against fixture data (a mix of paid/unpaid/overdue invoices, draft/sent/accepted quotes).
- `platform/api/tests/customers.test.ts` (extend): `GET /api/customers/stats` returns correct `totalClients`/`outstanding`/`withOverdue` against fixture data, and is tenant-isolated (a second tenant's customers/invoices don't leak into the count).
- `platform/api/tests/invoices.test.ts` / `tests/quotes.test.ts` (extend): equivalent stats-route tests.
- `platform/frontend/tests/DashboardHomePage.test.tsx` (new): renders the stat cards and invoice-status bars from mocked data.
- `platform/frontend/tests/CustomersListPage.test.tsx` / `InvoicesListPage.test.tsx` / `QuotesListPage.test.tsx` (extend): assert the new stat row renders the right numbers from mocked `apiGet`.

## Global constraints

- Every new route: `requireTenantAuth, requireActiveSubscription`, tenant-scoped via `tenantScope()` where that accessor pattern already exists, or a direct `prisma.<model>.aggregate/count({ where: { tenantId, ... } })` where the spec above calls for an aggregation `tenantScope()` doesn't already expose (matches how `reports.ts` already does its own direct-`prisma` aggregations rather than adding narrow one-off `scoped.ts` accessors for pure read rollups).
- No new Prisma migration in this spec at all — every field already exists.
- Match Barkie's own existing Tailwind card/stat styling (check `ReportsPage.tsx` and `CompanyProfilePage.tsx` for the established look) — do not attempt to replicate the reference screenshots' dark/purple theme.
