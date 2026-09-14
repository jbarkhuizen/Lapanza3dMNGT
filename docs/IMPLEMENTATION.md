# Barkie — Implementation Documentation

_Last updated: 2026-09-14_

## What Barkie is

Barkie is a multi-tenant SaaS platform for small 3D-printing businesses. One subscription per tenant (print shop); each tenant's data is fully isolated from every other tenant. It replaces spreadsheets and guesswork with real job costing, customer/quote/invoice management, and shop operations tooling — plus a free-standing public landing site and a per-tenant public shop page.

## Repository layout

```
Barkie/
├── platform/api/         Backend — Node 20+/TypeScript strict/Express 5/Postgres 16/Prisma/zod
├── platform/frontend/    Tenant dashboard — React 18/Vite/TS/Tailwind/React Router v6/@tanstack/react-query
├── landing/               Public marketing site + per-tenant public shop pages — plain Express + static HTML/vanilla JS
└── docs/superpowers/      Design specs and implementation plans for every feature, in build order
```

## Core architecture

- **Multi-tenancy**: every tenant-owned table carries a `tenantId` column; all reads/writes go through `tenantScope(tenantId)` (`platform/api/src/db/scoped.ts`), which enforces isolation at the data-access layer, not just in route handlers.
- **Auth**: session-cookie based. Three subject types share one polymorphic `Session` model — tenant owners, team members (see Team Accounts below), and platform admins.
- **Team accounts**: a tenant owner can invite up to 3 active team members with `admin` or `sales` roles. Sales-role users can operate the day-to-day tools (customers, quotes, printers, etc.) but are blocked from billing, company/shop profile, and reports.
- **Billing**: PayFast and PayPal supported, with a 14-day free trial, three pricing tiers, and graceful handling of past-due/lapsed subscriptions (read-only access, not a hard lockout).
- **Money math**: every costing/quote/invoice calculation uses `Prisma.Decimal` with an explicit, documented rounding order — never floating point — so totals are reproducible and auditable.

## Feature areas

### Job costing
Track Filaments, Labour Steps, Consumables, Printers, Scanners, Laser Materials, and Pre-made Items as priced inputs. Build a **Costing Template** per job type (process: `printer` / `scanner` / `laser_sheet` / `laser_premade`) that computes filament/electricity/depreciation/labour/consumables cost plus a markup to a suggested sell price — the real cost of a print, not a guess.

### STL Slicer
Upload an STL, pick a printer/filament, and get real sliced weight, support weight, filament length, and print time back — computed by an actual slicing engine (PrusaSlicer CLI) running server-side, not estimated. Feeds directly into Costing Templates, Job Cards, and Quotes so those numbers come from the model, not a guess.

### Customers, Quotes, Invoices
Standard CRM-lite: customer records, quotes (with line items built from costing templates), one-click quote→invoice conversion, PDF generation, discounts (percent, applied to total or per-line), payment terms, and a payment-link field for invoices.

### Job Cards
Customer-facing intake tickets for three job types — repair, print, CAD design — each with its own relevant fields (e.g. a repair ticket tracks what the customer brought in and what was found wrong; a print ticket tracks the file, material, and finishing steps requested). A Job Card can be converted straight into a Quote.

### Jobs board
A running list of active print/production jobs with status tracking (queued → in progress → done), separate from the customer-facing Job Card intake flow — this is the shop-floor view.

### Shop Profile & public shop page
Each tenant gets a public page (under the landing site) listing their services, trading hours, gallery, and social/marketplace links (Printables, MakerWorld, Thingiverse, etc.) — a lightweight storefront that needs no separate hosting.

### Reports & Dashboard
At-a-glance stats: open invoices/quotes, revenue this month, invoice status breakdown, converted-quote rate — computed live from the tenant's own data.

### Notifications
In-app + optional email notifications for trial ending, low stock, overdue invoices, payment events, and subscription status changes — each independently toggleable per channel in Notification Settings.

### Feature Request Board
A shared, cross-tenant list where any tenant can submit and upvote feature ideas — deliberately the one place in the system where data is visible across tenants (by design, not a bug), since it's a community roadmap.

### Materials Library
A read-only reference catalogue of filament/resin material properties (not a tenant-owned resource) — helps a tenant pick a material and compare properties before adding it to their own Filaments list.

## User interface conventions

- **Inline add/edit, not full-page navigation**: every simple resource list (Filaments, Customers, Labour Steps, Consumables, Printers, Scanners, Laser Materials, Pre-made Items, Products) has its add form always visible above the table (essentials only, with a "+ More details" toggle for optional fields), and editing an existing row expands it in place — never navigating to a separate blank page. A direct link like `/filaments/123` still works as a deep-link fallback; it lands on the list page with that row already expanded.
- **Dark mode**: System/Light/Dark, available from the header on every page and (on the public site) from the nav. Defaults to following the device's OS setting; an explicit choice is remembered and carries over between the public site and the dashboard automatically (same login, same device).

## Deployment

Production runs on a single VPS (`barkie.co.za`) under three systemd services: `barkie-api` (backend, port 4200 internally), `barkie-landing` (public site + shop pages), and a static build of the dashboard served under `/app`. Postgres runs locally on the same box. Deploys are a build-tar-scp-extract-restart cycle per service; database migrations run via `npx prisma migrate deploy` before the API restarts.

## Where to find more detail

Every feature above has a full design spec and implementation plan under `docs/superpowers/specs/` and `docs/superpowers/plans/`, written before the feature was built — these document the actual reasoning, tradeoffs, and scope decisions behind each one, not just the end result.
