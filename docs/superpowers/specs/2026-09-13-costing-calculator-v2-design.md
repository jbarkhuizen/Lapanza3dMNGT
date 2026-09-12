# Costing Calculator v2: Scanners, Laser Materials, Products — Design Spec

**Source:** competitor reference screenshots (Costing Calculator's Machines/Scanners/Materials/Consumables/Hardware/Labour/Products tabs). The largest single item in this round — extends the existing Costing Templates feature (`platform/api/src/costing/calculate.ts`, `routes/costing-templates.ts`, `Printer`/`Filament`/`CostingTemplate` models) rather than replacing it.

## Scope decision — read before starting

Explicitly **out of scope** for this pass (each is a genuinely separate, large undertaking):
- **Real slicer integration** ("Real PrusaSlicer estimate" in the reference) — would need either a server-side slicer CLI invocation or a WASM slicer in-browser. Not attempted.
- **Detailed per-machine slicer-preset fields** (layer height, infill density/pattern, nozzle size, wall count, speed limits, flow rates) — these only matter once real slicing exists; without it they're inert form fields. Skip entirely.
- **"Live Summary updates as you type"** is not a special feature — it's ordinary React controlled-form state. Build the calculator form with normal `useState`/derived values; there is nothing extra to engineer here.
- **"Stats for nerds" panel** — no defined data behind it in the reference, skip.
- **Product stock tracking** (On hand / Available / Reserved columns) — a real inventory-movement ledger is a separate feature. `Product` in this pass is a simple named price catalog only (name, category, cost, selling price) — no stock columns, no reservation logic.
- **Resin as a separate material model** — `Filament` already has the exact right shape for resin (`costPerKg` or `costPerSpool`/`spoolWeightGrams` → cost per gram; resin's "bottle cost ÷ bottle volume in mL" is the identical formula with different units). Do not create a new `Resin` model — resin bottles are just `Filament` rows with `materialType` describing the resin (e.g. `"Resin — Standard"`). No schema change needed for this.

## Data model

Add `process` to `Printer` (`String @default("fdm")`, values `'fdm' | 'resin' | 'laser'`) — a laser cutter/engraver is tracked as a `Printer` row too (same "purchase cost ÷ hours to replace + electricity/hr" formula the reference shows for the Machines tab applies uniformly across fdm/resin/laser machines; only *material* costing differs by process, not machine costing).

New models:

```prisma
model Scanner {
  id                  String   @id @default(uuid())
  tenantId            String
  name                String
  scannerCost         Float
  expectedScanHours   Float
  powerCostPerHour    Float    @default(0)
  createdAt           DateTime @default(now()) @db.Timestamptz(3)

  tenant Tenant @relation(fields: [tenantId], references: [id])
  costingTemplates CostingTemplate[]

  @@index([tenantId])
  @@map("scanners")
}

model LaserMaterial {
  id                String   @id @default(uuid())
  tenantId          String
  name               String
  sheetPrice        Float
  sheetAreaM2       Float
  usableSheetAreaM2 Float
  costMultiplier    Float    @default(1)
  createdAt         DateTime @default(now()) @db.Timestamptz(3)

  tenant Tenant @relation(fields: [tenantId], references: [id])
  costingTemplates CostingTemplate[]

  @@index([tenantId])
  @@map("laser_materials")
}

model PremadeItem {
  id             String   @id @default(uuid())
  tenantId       String
  name           String
  unitCost       Float
  costMultiplier Float    @default(1)
  createdAt      DateTime @default(now()) @db.Timestamptz(3)

  tenant Tenant @relation(fields: [tenantId], references: [id])
  costingTemplates CostingTemplate[]

  @@index([tenantId])
  @@map("premade_items")
}

model Product {
  id           String   @id @default(uuid())
  tenantId     String
  name         String
  category     String?
  cost         Decimal  @db.Decimal(12, 2)
  sellingPrice Decimal  @db.Decimal(12, 2)
  createdAt    DateTime @default(now()) @db.Timestamptz(3)

  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@index([tenantId])
  @@map("products")
}
```

Extend `CostingTemplate` with:
```prisma
process              String   @default("printer")
scannerId            String?
scannerSnapshotName  String?
scanHours            Float?
laserMaterialId      String?
laserMaterialSnapshotName String?
sheetAreaUsedM2      Float?
premadeItemId        String?
premadeItemSnapshotName String?
premadeItemQuantity  Int?
```
`process`: `'printer' | 'scanner' | 'laser_sheet' | 'laser_premade'` — decides which of the four input groups (existing filament+printer / new scanner+hours / new laser-sheet+area / new laser-premade+quantity) is required and populated; the other groups' fields stay null on that row, same "sparse columns per variant" convention as `JobCard`. `filamentId`/`printerId`/`weightGrams`/`printTimeHours` on `CostingTemplate` become optional (they already are nullable for `filamentId`/`printerId`; `weightGrams`/`printTimeHours` need to become nullable too since a `'scanner'`/`'laser_*'` template has neither).

Add inverse relations (`costingTemplates CostingTemplate[]`) is already listed above on `Scanner`/`LaserMaterial`/`PremadeItem`; add `products Product[]`, `scanners Scanner[]`, `laserMaterials LaserMaterial[]`, `premadeItems PremadeItem[]` on `Tenant`.

## Costing engine (`platform/api/src/costing/calculate.ts`)

Add two new exported functions alongside the existing `calculateCosting()` (do not modify `calculateCosting()`'s signature or behavior — every existing caller/test must keep passing unmodified):

- `calculateScannerCosting(input: { scannerCost: number; expectedScanHours: number; powerCostPerHour: number; scanHours: number; labourLines: LabourLineInput[]; consumableLines: ConsumableLineInput[]; markupPercent: number })` — `hourlyRate = round(scannerCost / expectedScanHours + powerCostPerHour, 4)` (matches the reference's own stated formula `scanner cost ÷ expected scan hours + power/hr`), `scanCost = round(hourlyRate × scanHours, 2)`, then combine with labour/consumables/markup using the exact same accumulation and rounding steps `calculateCosting` already uses for its own labour/consumables/markup section (factor that shared tail into a small internal helper both functions call, rather than duplicating the rounding logic inline twice).
- `calculateLaserCosting(input)` — two variants: sheet-based (`perPartCost = round((areaM2 / usableSheetAreaM2) × sheetPrice × costMultiplier, 2)` per the reference's own formula `part m² × (sheet price ÷ usable sheet m²) × multiplier` — implement precisely as stated, don't rederive) or premade-item-based (`itemCost = round(unitCost × costMultiplier × quantity, 2)`), then the same shared labour/consumables/markup tail.

## Backend routes

**`platform/api/src/routes/scanners.ts`, `laser-materials.ts`, `premade-items.ts`, `products.ts`** (new routers, mounted in `app.ts`) — plain tenant-scoped CRUD (list/create/update/delete) for each, `requireTenantAuth, requireActiveSubscription`, following `platform/api/src/routes/consumables.ts` as the closest existing structural sibling (simple named resource with a cost field).

**`platform/api/src/routes/costing-templates.ts`** — extend the create schema to a discriminated union on `process` (same technique as `JobCard`'s discriminated union in the Job Cards spec — reject fields that don't belong to the selected process, same as that spec requires). For `'scanner'`/`'laser_sheet'`/`'laser_premade'`, resolve and snapshot the referenced `Scanner`/`LaserMaterial`/`PremadeItem` exactly like the existing `'printer'` path already snapshots `Filament`/`Printer` (name, relevant cost fields) — read the existing POST handler in full first and mirror its snapshot-then-calculate-then-persist structure for the three new branches.

**`platform/api/src/db/scoped.ts`** — add `scanners`, `laserMaterials`, `premadeItems`, `products` accessors (plain CRUD, mirroring `consumables`), and extend `CreateCostingTemplateInput`/the `costingTemplates.create()` accessor for the new optional fields.

## Frontend (`platform/frontend`)

**`platform/frontend/src/pages/costingTemplates/`** — read the existing multi-tab structure first (it should already have something resembling Calculator/Machines/Materials/Consumables/Hardware/Labour tabs from the original build — check exact current file/tab names before assuming). Add:
- A **Scanners** tab (list + add/edit/delete, mirroring the Machines tab's table pattern).
- Within the existing **Materials** tab, add **Laser materials** (sheet stock) and **Pre-made items** sub-sections below the existing filament/resin list (same page, extra sections — don't create a whole separate top-level tab for these, matching the reference's own Materials-tab grouping).
- A **Products** tab (list + add/edit/delete, no stock columns per the scope decision above).
- The **Calculator** tab's form gains a process selector (Printer / Scanner / Laser — sheet / Laser — premade item) that swaps the visible input group accordingly, matching the four backend variants; the live summary sidebar recomputes from whichever `calculate*Costing` shape applies (call the same `POST /api/costing-templates` "preview" logic if one exists, or replicate the display-only math client-side purely for the live-updating summary — check whether the existing Calculator tab already does client-side preview math or always round-trips to the server for its live summary, and follow whichever pattern is already established rather than introducing a second one).

## Tests

- `platform/api/tests/costing-calculate.test.ts` (extend): `calculateScannerCosting`/`calculateLaserCosting` unit tests against known inputs (mirror the existing FDM tests' style — a rounding-order discriminating case for each, same rigor as the existing suggestedPrice rounding-order test already in this file).
- `platform/api/tests/scanners.test.ts` / `laser-materials.test.ts` / `premade-items.test.ts` / `products.test.ts` (new): CRUD + tenant isolation, following the shortest existing resource test file (`consumables.test.ts`) as the template.
- `platform/api/tests/costing-templates.test.ts` (extend): create-with-`process:'scanner'` and both laser variants, each snapshotting correctly and rejecting cross-process fields.
- `platform/frontend`: extend the existing Costing Templates page test file(s) for the new tabs/sections and the calculator's process selector.

## Global constraints

- `calculateCosting()` itself is unmodified — new functions live alongside it.
- Every new route: `requireTenantAuth, requireActiveSubscription`, tenant-scoped.
- Follow the exact formulas given above for scanner/laser costing — they're transcribed directly from the reference product's own stated formulas, not re-derived.
