# Costing engine — design spec

Status: approved (2026-09-07)

## Context

SRS §4.10 calls print-job costing the calculation engine at the centre of
the platform, and SRS §8.3 names it (with quotes/invoices) the
non-negotiable core — the thing that actually lets a subscriber quote and
invoice real work. Every input this engine needs now exists: Printer
(with power draw and purchase cost), Filament (spool cost/weight), Labour
Step (hourly rates), Consumable (unit cost). This spec adds the
calculation itself and the `CostingTemplate` it produces.

This is API-only, same as every prior slice — no frontend exists yet.

## Goals

- Compute a print job's true cost from filament, printer (electricity +
  depreciation), labour, and consumables, plus a markup percentage, per
  SRS §4.10's exact cost components.
- Save the result as a reusable `CostingTemplate` — a **snapshot**, not a
  live-recalculating record. Reopening an old template shows exactly what
  it cost when saved, even if filament/labour/consumable prices have
  since changed. Matches the SRS's own UI language for this page
  ("Open/duplicate template," not "edit template") — recosting with
  today's prices is a duplicate-and-recalculate action, not an edit.
- Get the money arithmetic right from the start. This is the single
  highest-risk piece of the whole platform per the Phase 1 design spec's
  own callout ("money math correctness matters more than schedule") —
  every computed cost/total field uses Prisma's `Decimal` type, not
  `Float`, so multiply/sum/markup arithmetic can't accumulate float
  rounding error into a wrong price. Physical quantities (grams, hours,
  watts) stay `Float` — only money is `Decimal`.
- Keep the calculation itself a pure, DB-free function, tested directly
  with exact numeric assertions — separate from the route/persistence
  layer, so the arithmetic can be verified exhaustively without spinning
  up HTTP/Postgres for every case.

## Non-goals

- Any frontend/UI.
- Quotes/invoices themselves (the next slice after this one — it will add
  a costed template as a line item, but that's a different concern).
- Editing a saved template's inputs (no `PATCH` — see Goals; duplicating
  is a future "Costing Templates — Open/duplicate" UI action, not an API
  concern for this slice, and isn't built here either since there's no
  frontend to drive it yet).
- Filament price history, low-stock notifications (already deferred in
  the reference-data-modules spec).
- Automatic STL upload / slicer integration — explicitly deferred to
  Phase 3 in the SRS; print time stays a manual entry, copied from the
  subscriber's own slicer, exactly as SRS §4.10 assumes for v1.

## Printer model change

Two new optional fields (additive migration, no data loss):

- `electricityRatePerKwh` (`Decimal`) — R/kWh, per-printer per your
  earlier decision (not a tenant-wide default).
- `expectedLifetimeHours` (`Float`) — for straight-line depreciation.

Both stay optional at the `Printer` level (a printer can exist without
them, same as today), but creating a `CostingTemplate` against a printer
missing either value returns 400 — costing can't run without them.

## Data model

- **`CostingTemplate`**: `name`, `printTimeHours`, `markupPercent`
  (`Decimal`), the printer/filament references (nullable FK, `SetNull` on
  delete — no delete routes exist anywhere in this codebase yet, but this
  keeps a future one safe), snapshotted source values
  (`filamentSnapshotCostPerKg`, `printerSnapshotElectricityRatePerKwh`,
  `printerSnapshotDepreciationPerHour`, etc. — `Decimal`), and the seven
  computed outputs (`filamentCost`, `electricityCost`, `depreciationCost`,
  `labourCost`, `consumablesCost`, `totalCost`, `suggestedPrice`, all
  `Decimal`).
- **`CostingLabourLine`** (belongs to a `CostingTemplate`): nullable FK to
  the source `LabourStep`, snapshotted name + hourly rate, `hours`
  (`Float`), computed `lineCost` (`Decimal`). A template can reference
  multiple labour steps.
- **`CostingConsumableLine`** (belongs to a `CostingTemplate`): nullable
  FK to the source `Consumable`, snapshotted name + cost per unit,
  `quantity` (`Float`), computed `lineCost` (`Decimal`). A template can
  reference multiple consumables.

All tenant-scoped (`tenantId` on every table, queried only through
`tenantScope`, same pattern as every prior module).

## Calculation (pure function, `src/costing/calculate.ts`)

Inputs: resolved filament record + weight in grams, resolved printer
record + print time in hours, an array of `{ labourStep, hours }`, an
array of `{ consumable, quantity }`, and a markup percentage. No DB
access inside the function — the route resolves everything first.

Formulas, straight from SRS §4.10:

- **Filament cost** = weight(g) × cost-per-gram. Cost-per-gram is derived
  from the filament record: prefer `costPerKg ÷ 1000`; if that's not set,
  fall back to `costPerSpool ÷ spoolWeightGrams`. If neither is available,
  the route rejects the request with 400 — no undefined-cost templates.
- **Electricity cost** = printTimeHours × (printer `powerDrawWatts` ÷
  1000) × printer `electricityRatePerKwh`.
- **Depreciation cost** = printTimeHours × (printer `purchaseCost` ÷
  printer `expectedLifetimeHours`) — straight-line, per SRS's suggested
  method.
- **Labour cost** = Σ over labour lines of (hours × hourlyRate).
- **Consumables cost** = Σ over consumable lines of (quantity ×
  costPerUnit).
- **Total cost** = filament + electricity + depreciation + labour +
  consumables.
- **Suggested price** = total × (1 + markupPercent ÷ 100).

## API shape

- `POST /api/costing-templates` — body selects a filament + weight, a
  printer, print time, an array of labour lines, an array of consumable
  lines, and a markup %. Resolves each reference (verifying it belongs to
  the calling tenant — same `tenantScope` pattern as everywhere else),
  runs the calculation, persists the full snapshot + line items, returns
  the created template with its full cost breakdown.
- `GET /api/costing-templates` — list (summary fields: name, totalCost,
  suggestedPrice, createdAt).
- `GET /api/costing-templates/:id` — full detail including both line-item
  arrays.

All behind `requireTenantAuth`. No `PATCH`, no `DELETE` (see Non-goals).

## Key risks / things to get right

- **Decimal arithmetic, not float.** Every money-typed field uses
  Prisma's `Decimal` (backed by `decimal.js`), and the calculation
  function must use `Decimal` arithmetic methods (`.times()`, `.plus()`,
  `.dividedBy()`) throughout — never coerce to a plain JS number
  mid-calculation, which would silently reintroduce float error.
- **Tenant isolation on every resolved reference.** The route must verify
  the filament, printer, every labour step, and every consumable actually
  belong to the calling tenant before using them in the calculation — not
  just before the final save. This is the same category of risk the
  reference-data-modules plan's nested-resource work already solved
  once; apply the same discipline here across four different reference
  types in one request instead of one.
- **Exhaustive numeric testing of the pure function**, independent of any
  HTTP/DB test — this is the piece where a rounding or formula bug would
  be most costly and least visible.

## Out of scope for this spec

Quotes/invoices (next slice), any frontend, editing/duplicating a saved
template, Phase 2/3 items.
