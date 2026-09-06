# Barkie platform — Phase 1 design spec

Status: approved (2026-09-06)

## Context

Full product scope is defined in the client-confirmed SRS:
`S:\3d Bytes\3d Management Project\3d Management_Requirements_Specification
V0.21.docx`. A second document (`3D Print Shop Management Platform - Google
Gemini.pdf`) captures an earlier, larger brainstorm — most of it deferred,
three items pulled forward into Phase 1 (see below).

The SRS assumed PHP/Laravel+MySQL on shared cPanel hosting because that's
what the panel screenshot showed. Reality: barkie.co.za will run on the same
VPS as lapanza3d.co.za, in its own folder/process, with full root-level
control — no cPanel constraint applies. This spec supersedes SRS §6
(Technical Recommendations) on stack choice; all functional requirements in
SRS §3–5 and §9 remain authoritative.

The SRS's dates (MVP 1 Jul 2026, full launch 1 Aug 2026) have passed with no
build having started. This spec drops fixed dates — Phase 1 ships when it's
correct, prioritizing the costing engine and quote/invoice generation
(money-handling code) over speed.

This is the design for **Phase 1** only. Phase 2 (billing/subscription
automation, full platform admin, 2FA, notifications, newsletter, reports)
and Phase 3 (SRS §7 deferred items) get their own specs later, once Phase 1
is live and real subscriber feedback exists.

## Goals

- Deliver the full SRS v1 operational core: a subscriber can manage
  customers, printers, filament, labour rates, and consumables; cost a job
  accurately; and produce a branded quote or invoice PDF.
- Fold in three Gemini-doc items the business owner wants now (not deferred):
  a public shop profile page, a materials comparison library, and a Kanban
  production queue.
- Build on infrastructure Barkie's owner already runs successfully
  (Node/Express, same VPS), rather than a stack forced by a hosting
  assumption that no longer applies.
- Keep tenant data properly isolated from day one, even though v1 has only
  one login per subscriber (SRS §3) — the isolation model must not need
  rearchitecting when staff logins (Phase 3) arrive.

## Non-goals (this spec)

- Subscription billing, trial/lapsed states, PayFast/PayPal integration —
  Phase 2.
- Platform admin panel beyond what's needed to view/support subscribers
  during Phase 1 development — full admin is Phase 2.
- Two-factor auth, email notification system, newsletter integration,
  reports/history dashboard — Phase 2.
- Multiple staff logins, customer self-service portal, direct printer
  telemetry, automatic STL slicing, SMS/WhatsApp, RFID/QR tagging, Zoho
  Books sync, Google Maps geolocation — Phase 3 or later, per SRS §7 and
  the Gemini items not selected for Phase 1.

## Architecture

- **Runtime**: Node.js + TypeScript throughout.
- **Frontend**: Vite + React SPA. One app, route-gated sections for public
  pages (marketing, `/shop/{slug}`), the authenticated subscriber
  dashboard, and a lightweight internal admin view.
- **Backend**: Express + TypeScript API, separate process — same two-process
  shape (build + API server) as lapanza-3d already runs on this VPS.
- **Database**: PostgreSQL. Chosen over SQLite (lapanza-3d's choice) because
  Barkie is a paying multi-tenant product handling money, with many
  subscribers writing concurrently — needs real concurrent-write support,
  migration tooling, and a proper backup/replication story.
- **ORM/migrations**: Prisma — generated TypeScript types keep the costing
  engine and invoice math honest against the schema, migrations are
  reviewable diffs.
- **Multi-tenancy**: single database; every tenant-scoped table carries a
  `tenant_id` column. Isolation enforced at the query layer via a scoped
  Prisma client wrapper (every tenant-scoped query is required to pass
  through it) rather than Postgres row-level security. RLS is a valid future
  hardening step, not required for a v1 with one login per subscriber and a
  small trusted admin surface.
- **Auth**: email + bcrypt-hashed password, httpOnly session cookie backed
  by a `sessions` table (not JWT — simpler to revoke, matches lapanza-3d's
  existing use of `cookie-parser`). Email verification required before full
  access, per SRS §4.1.
- **PDF generation** (quotes/invoices): `@react-pdf/renderer` — pure
  JS/Node, no headless-Chrome process to run alongside the API on a modest
  VPS. Revisit in favor of Puppeteer only if branded-layout limitations
  become a real problem once real invoices are being designed.
- **File uploads** (logos, shop-profile gallery images): stored on local
  disk under a `uploads/` volume, served statically by the API behind auth
  where relevant; size-limited and type-validated server-side.

## Data model (Phase 1)

Tenant-scoped tables (all carry `tenant_id`):

- `tenants` — company profile, VAT status, banking details, logo, accent
  colour, T&Cs text (SRS §4.4).
- `shop_profiles` — public page content: slug, tagline, services offered,
  operating hours, up to 5 gallery images, contact links (email, phone,
  WhatsApp, website, socials). One-to-one with `tenants`.
- `customers` (SRS §4.5).
- `printers`, `printer_presets`, `printer_maintenance_log` (SRS §4.6).
- `labour_steps` (SRS §4.7).
- `consumables` (SRS §4.8).
- `filaments` (spools, SRS §4.9).
- `costing_templates` (SRS §4.10) — a saved, reusable costed object.
- `jobs` — new for the Kanban board: references a `costing_template`,
  tracks state (`backlog` / `slicing` / `printing` / `post_processing` /
  `done`), optionally linked to a `customer` and, once invoiced, a `quote`
  or `invoice`.
- `quotes`, `quote_line_items`, `invoices`, `invoice_line_items` (SRS §4.11).

Global (not tenant-scoped):

- `materials_reference` — the comparison library: material type, recommended
  nozzle/bed temps, typical ZAR/kg range, and application-based tags
  (outdoor/UV, food-safe, flexible, chemical-resistant, etc.). Seeded data;
  editable later from an admin screen, not required in Phase 1.

Platform-level:

- `platform_admins` — separate from tenant users, per SRS §4.3/§9.6 (login
  page exists in Phase 1 for internal use; the full admin feature set is
  Phase 2).
- `sessions` — backs cookie auth for both tenant users and platform admins.

## New pages beyond the SRS site map (§9)

- Public `/shop/{slug}` — read-only shop profile page (no login required).
- Settings → Shop Profile — editor for the fields above, with a live
  preview link to the public page.
- Costing area gains a Kanban board view (`Jobs`) alongside the existing
  Costing Templates list — a template becomes a job when work starts;
  the board is drag-and-drop between the five states.
- Filament Library gains a Material Selector sub-page: filterable/comparison
  view over `materials_reference`, with a "use this material" link that
  pre-fills a new costing template.

## Key risks / things to get right

- **Money math correctness** (costing engine, VAT application, quote→invoice
  conversion) matters more than schedule — per SRS §8.3's own caution, this
  is the non-negotiable core. Needs deliberate test coverage, not just
  manual click-through.
- **Tenant isolation bugs** are a cross-tenant data leak, not just a
  cosmetic bug — the scoped-query wrapper needs to be the only way
  tenant-scoped tables are queried, enforced by convention/lint, not just
  discipline.
- **POPIA consent** must be captured at sign-up even though billing is
  Phase 2 — SRS §5.3 requires this from day one, not bolted on later.
- **PayFast/PayPal merchant credentials** aren't needed for Phase 1, but
  note the dependency now so it isn't a Phase 2 surprise.

## Phase roadmap (unchanged shape, restated)

- **Phase 1 (this spec)**: SRS v1 operational core + shop profile page +
  material selector + Kanban queue.
- **Phase 2**: subscription/billing automation, full platform admin, 2FA,
  notification system, newsletter opt-in integration, reports/history
  dashboard.
- **Phase 3**: SRS §7 deferred items (multi-staff logins, customer portal,
  printer telemetry, automatic STL slicing, SMS/WhatsApp) plus any
  not-yet-selected Gemini items (RFID/QR tagging, Zoho Books sync, Maps
  geolocation), prioritized by real subscriber demand once live.

## Next step

Phase 1 is still too large for a single implementation plan — it spans
auth, seven-plus reference-data modules, a costing engine, document
generation, and two new page types. The next step is to break Phase 1 into
an ordered build sequence (foundation → reference-data modules → costing
engine → quotes/invoices → the two new Gemini-derived features), each with
its own detailed plan, via the writing-plans skill.
