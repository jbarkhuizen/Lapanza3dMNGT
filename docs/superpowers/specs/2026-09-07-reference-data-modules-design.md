# Reference data modules — design spec

Status: approved (2026-09-07)

## Context

Phase 1 Foundation (auth, tenant isolation, Customer CRUD) is merged to
`master` and pushed. This spec covers the next slice: the four remaining
reference-data modules the costing engine will need as inputs — printers
(with presets and a maintenance log), filament, labour rates, and
consumables. Fields come directly from the confirmed SRS (§4.6–§4.9); no
new product decisions are needed here, just building what's already
specified.

This is API-only, same as Foundation — no frontend exists yet anywhere in
the project, and building one is explicitly deferred to its own later
slice (tracked as backlog item "Phase 1: Subscriber dashboard frontend").

## Goals

- Give a subscriber full CRUD over printers (+ per-printer presets and a
  maintenance log), filament spools, labour steps, and consumables —
  everything SRS §4.6–§4.9 asks for except price-history tracking and
  low-stock *notifications* (the threshold field is stored; alerting is
  Phase 2).
- Extend the existing tenant-scoped wrapper pattern (`tenantScope`) to six
  new resource types without weakening the isolation guarantee Task 6 of
  Foundation proved.
- Keep the same conventions Foundation established: response shape,
  validation via zod, `requireTenantAuth`, Node test runner + supertest
  against a real Postgres test database.

## Non-goals

- Any frontend/UI.
- Filament price-history (SRS mentions retaining it; not built this pass —
  the `Filament` table's `costPerKg` can simply be updated in place for
  now, a follow-up can add a history table later without disrupting this
  one).
- Low-stock alerting/notifications (Phase 2 — this pass only stores the
  threshold field so a later notification system has something to read).
- The costing engine itself (next slice after this one — it consumes these
  four modules' data but isn't built here).

## Data model

All new models are tenant-scoped (`tenantId` column, queried only through
`tenantScope`), same as `Customer`.

- **`Printer`**: name, make, model, buildVolumeX/Y/Z (mm), purchaseDate,
  purchaseCost, powerDrawWatts, status (`active`/`maintenance`/`retired`).
- **`PrinterPreset`** (belongs to a `Printer`): name, materialType,
  nozzleTemp, bedTemp, printSpeed, layerHeight, infillPercent, notes.
- **`PrinterMaintenanceLog`** (belongs to a `Printer`): date, description,
  cost, performedBy.
- **`Filament`**: brand, materialType, colour, diameterMm (1.75 or 2.85),
  costPerSpool, costPerKg, spoolWeightGrams, remainingWeightGrams,
  supplier, purchaseDate, notes, lowStockThresholdGrams.
- **`LabourStep`**: name, hourlyRate, active (boolean).
- **`Consumable`**: name, category (resin/nozzle/adhesive/
  post-processing/packaging/other), unitOfMeasure, costPerUnit,
  currentStock, reorderThreshold, supplier.

All `DateTime` fields carry `@db.Timestamptz(3)` (the Foundation plan's
global constraint that was originally missed and fixed — not repeating
that mistake here).

## API shape

Same convention as `/api/customers`:

- `GET/POST /api/printers`, `GET/PATCH /api/printers/:id`
- `GET/POST /api/printers/:printerId/presets`, `PATCH /api/printers/:printerId/presets/:id` (nested — a preset only exists in the context of its printer)
- `GET/POST /api/printers/:printerId/maintenance-log`, no PATCH (append-only, like Task 3's `resetTestDatabase` philosophy for audit-style records — a logged maintenance entry doesn't get edited, only added)
- `GET/POST /api/filaments`, `GET/PATCH /api/filaments/:id`
- `GET/POST /api/labour-steps`, `GET/PATCH /api/labour-steps/:id`
- `GET/POST /api/consumables`, `GET/PATCH /api/consumables/:id`

All behind `requireTenantAuth`. All queries go through `tenantScope`,
extended with six new resource groups following the exact pattern
`scoped.ts` already established for `customers` (including the `update()`
`tenantId`-stripping hardening from Foundation's Task 6 fix — every new
`update` method gets it from the start this time, not added after review).

## Key risks / things to get right

- **Nested-resource tenant scoping**: a preset or maintenance-log route
  must verify the parent `Printer` belongs to the calling tenant before
  touching child rows — not just scope the child query by `tenantId`
  directly (which works, but a route that resolves `printerId` from the
  URL without checking it belongs to this tenant first could leak whether
  a printer ID exists, even if it can't read its data). Task 7's Customer
  routes didn't have this nesting problem; this is genuinely new here.
- **Consistency with Foundation's fixed mistakes**: `@db.Timestamptz(3)`
  on every DateTime field from the start, `tenantId` stripped from every
  `update()` payload from the start, `migration_lock.toml` committed
  correctly — these were all Foundation review findings; this plan should
  not need a review round to catch the same three things again.

## Out of scope for this spec

The costing engine (next slice), the subscriber dashboard frontend
(separate slice, tracked in the backlog), quotes/invoices, Phase 2 items.
