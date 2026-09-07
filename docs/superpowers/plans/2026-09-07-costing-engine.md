# Costing Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the print-job costing engine — a pure, exhaustively-tested calculation function plus a `CostingTemplate` resource that resolves a tenant's own filament/printer/labour/consumable records, runs the calculation, and persists a full cost-breakdown snapshot.

**Architecture:** Same Express + Prisma + `tenantScope` pattern as every prior module, with one new element: money arithmetic uses Prisma's `Decimal` type throughout (not `Float`), and the calculation itself lives in a DB-free pure function (`src/costing/calculate.ts`) tested with exact numeric assertions, separate from the route that resolves references and persists the result.

**Tech Stack:** Same as every prior plan — Node 20+, TypeScript strict, Express 5, Prisma + PostgreSQL, zod, Node's built-in test runner + supertest. New: Prisma's `Decimal` (`decimal.js`, re-exported as `Prisma.Decimal` from `@prisma/client`).

## Global Constraints

- All constraints from the Foundation and Reference Data Modules plans still apply (response shape `{ ok: true, ... }` / `{ ok: false, error }`, sentence-case errors, no `any`, ESM, npm, `@db.Timestamptz(3)` on every `DateTime`, `tenantId` stripped from every `update()`).
- **Every money-typed field (computed costs, totals, markup, snapshotted rates) is Prisma `Decimal`, not `Float`.** Physical quantities (grams, hours, watts, weight) stay `Float`. This is new to this plan — earlier plans used `Float` for cost fields on reference-data tables; those are unchanged (out of scope here), but every NEW field this plan introduces for money follows `Decimal`.
- **The calculation function (`calculateCosting`) never coerces a `Decimal` to a plain JS number mid-calculation.** Use `Prisma.Decimal`'s own arithmetic methods (`.times()`, `.plus()`, `.dividedBy()`) throughout. Convert to `.toString()` only at the boundary where a value is written to Prisma or compared in a test.
- **`CostingTemplate` has no `PATCH`/`DELETE` route.** It's a snapshot, not an editable record — see the design spec's Non-goals.
- Directory root: `platform/api/` (same project as every prior plan).
- Run tests with `npm test` from `platform/api/` (`.env.test` / `barkie_test`, `--test-concurrency=1`).
- **New auth tests use the minimal-single-router-app pattern from the start** (see any of `printers.test.ts`/`filaments.test.ts`/`consumables.test.ts`'s "requires auth" test for the exact shape) — a prior plan had to fix this after final review; this plan's brief already specifies it correctly, don't regress to asserting against the full `buildApp()`.

---

## File Structure

```
platform/api/
  prisma/schema.prisma          # MODIFY — Printer gets 2 new fields (Task 1); 3 new models (Task 3)
  src/
    costing/
      calculate.ts                # NEW (Task 2) — pure calculation function, no DB
    db/scoped.ts                 # MODIFY — Printer create/update interfaces extended (Task 1); costingTemplates resource group added (Task 3)
    routes/
      printers.ts                 # MODIFY (Task 1) — 2 new optional fields in both zod schemas
      costing-templates.ts          # NEW (Task 3) — resolves references, calls calculateCosting, persists
    app.ts                        # MODIFY (Task 3) — mount costingTemplatesRouter
  tests/
    helpers/testApp.ts            # MODIFY (Task 3) — resetTestDatabase() grows by 3 new tables
    printers.test.ts               # MODIFY (Task 1) — new fields covered
    costing-calculate.test.ts       # NEW (Task 2) — exhaustive numeric tests, no DB/HTTP
    costing-templates.test.ts        # NEW (Task 3) — integration tests
    tenant-isolation.test.ts          # MODIFY (Task 3) — wrapper-level isolation test for costingTemplates
```

---

## Task 1: Printer electricity rate & depreciation lifetime

**Files:**
- Modify: `platform/api/prisma/schema.prisma`
- Modify: `platform/api/src/db/scoped.ts`
- Modify: `platform/api/src/routes/printers.ts`
- Test: `platform/api/tests/printers.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `Printer.electricityRatePerKwh` (`Prisma.Decimal | null`) and `Printer.expectedLifetimeHours` (`number | null`) — Task 3's costing route reads both directly off a resolved printer record.

- [ ] **Step 1: Add the two fields to `Printer` — modify `prisma/schema.prisma`**

Add these two lines to the `Printer` model, after `powerDrawWatts`:

```prisma
  electricityRatePerKwh Decimal? @db.Decimal(10, 4)
  expectedLifetimeHours Float?
```

- [ ] **Step 2: Run the migration**

Run (from `platform/api/`):
```
npx prisma migrate dev --name add_printer_electricity_and_depreciation
```

- [ ] **Step 3: Write the failing test — append to `tests/printers.test.ts`**

```typescript
test('create and update round-trip electricityRatePerKwh and expectedLifetimeHours', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);

  const createRes = await agent.post('/api/printers').send({
    name: 'Printer 1',
    purchaseCost: 4000,
    electricityRatePerKwh: 2.5,
    expectedLifetimeHours: 2000,
  });
  assert.equal(createRes.status, 201);
  assert.equal(createRes.body.printer.electricityRatePerKwh, '2.5000');
  assert.equal(createRes.body.printer.expectedLifetimeHours, 2000);
  const printerId = createRes.body.printer.id;

  const updateRes = await agent
    .patch(`/api/printers/${printerId}`)
    .send({ electricityRatePerKwh: 3.1 });
  assert.equal(updateRes.status, 200);

  const getRes = await agent.get(`/api/printers/${printerId}`);
  assert.equal(getRes.body.printer.electricityRatePerKwh, '3.1000');
});

test('POST /api/printers rejects a negative electricityRatePerKwh', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const res = await agent.post('/api/printers').send({
    name: 'Printer 1',
    electricityRatePerKwh: -1,
  });
  assert.equal(res.status, 400);
});
```

Note: Prisma serializes `Decimal` fields to JSON as strings with their full
stored scale (`@db.Decimal(10, 4)` means 4 decimal places), which is why
the assertion is `'2.5000'` not `2.5`.

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `electricityRatePerKwh`/`expectedLifetimeHours` are `undefined` in the response (schema doesn't have them yet), and the negative-value test fails because there's no validation for a field that doesn't exist.

- [ ] **Step 5: Extend the `Printer` interfaces in `src/db/scoped.ts`**

Add `electricityRatePerKwh?: number;` and `expectedLifetimeHours?: number;` to
both `CreatePrinterInput` and `UpdatePrinterInput` (alongside the existing
`powerDrawWatts?: number;` line in each). No other change needed in
`scoped.ts` — `create`/`update` already spread `...data`, so the new
fields flow through automatically once they're in the interfaces.

- [ ] **Step 6: Extend the zod schemas in `src/routes/printers.ts`**

Add to both `createPrinterSchema` and (implicitly, via `.partial()`)
`updatePrinterSchema`, alongside the existing `powerDrawWatts` line:

```typescript
  electricityRatePerKwh: z.number().nonnegative().optional(),
  expectedLifetimeHours: z.number().positive().optional(),
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add platform/api
git commit -m "Add per-printer electricity rate and expected lifetime for costing"
```

---

## Task 2: Pure costing calculation function

**Files:**
- Create: `platform/api/src/costing/calculate.ts`
- Test: `platform/api/tests/costing-calculate.test.ts`

**Interfaces:**
- Consumes: nothing (pure function, no DB, no Express — only imports `Prisma` from `@prisma/client` for the `Decimal` class, which is safe to import without connecting to a database).
- Produces: `calculateCosting(input: CostingInput): CostingResult` and `CostingInputError` (thrown when filament cost data is missing) — Task 3's route depends on this exact function name, its exact parameter shape, and every field of `CostingResult` (including `costPerGram` and `depreciationPerHour`, which Task 3 reuses for the snapshot fields rather than recomputing).

- [ ] **Step 1: Write the failing tests — `tests/costing-calculate.test.ts`**

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateCosting, CostingInputError } from '../src/costing/calculate.js';

const baseFilament = { weightGrams: 0, costPerKg: 0, costPerSpool: null, spoolWeightGrams: null };
const basePrinter = { printTimeHours: 0, powerDrawWatts: 0, electricityRatePerKwh: 0, purchaseCost: 0, expectedLifetimeHours: 1000 };

test('computes filament cost from costPerKg', () => {
  const result = calculateCosting({
    filament: { weightGrams: 50, costPerKg: 300, costPerSpool: null, spoolWeightGrams: null },
    printer: basePrinter,
    labourLines: [],
    consumableLines: [],
    markupPercent: 0,
  });
  assert.equal(result.filamentCost.toFixed(2), '15.00');
});

test('falls back to costPerSpool / spoolWeightGrams when costPerKg is not set', () => {
  const result = calculateCosting({
    filament: { weightGrams: 100, costPerKg: null, costPerSpool: 350, spoolWeightGrams: 1000 },
    printer: basePrinter,
    labourLines: [],
    consumableLines: [],
    markupPercent: 0,
  });
  assert.equal(result.filamentCost.toFixed(2), '35.00');
  assert.equal(result.costPerGram.toFixed(4), '0.3500');
});

test('throws CostingInputError when filament has no cost data', () => {
  assert.throws(
    () =>
      calculateCosting({
        filament: { weightGrams: 50, costPerKg: null, costPerSpool: null, spoolWeightGrams: null },
        printer: basePrinter,
        labourLines: [],
        consumableLines: [],
        markupPercent: 0,
      }),
    CostingInputError,
  );
});

test('computes electricity cost from print time, wattage, and rate', () => {
  const result = calculateCosting({
    filament: baseFilament,
    printer: { printTimeHours: 4, powerDrawWatts: 250, electricityRatePerKwh: 3, purchaseCost: 0, expectedLifetimeHours: 1000 },
    labourLines: [],
    consumableLines: [],
    markupPercent: 0,
  });
  assert.equal(result.electricityCost.toFixed(2), '3.00');
});

test('computes straight-line depreciation cost', () => {
  const result = calculateCosting({
    filament: baseFilament,
    printer: { printTimeHours: 5, powerDrawWatts: 0, electricityRatePerKwh: 0, purchaseCost: 4000, expectedLifetimeHours: 2000 },
    labourLines: [],
    consumableLines: [],
    markupPercent: 0,
  });
  assert.equal(result.depreciationPerHour.toFixed(2), '2.00');
  assert.equal(result.depreciationCost.toFixed(2), '10.00');
});

test('sums multiple labour lines and reports per-line costs', () => {
  const result = calculateCosting({
    filament: baseFilament,
    printer: basePrinter,
    labourLines: [
      { hourlyRate: 150, hours: 1 },
      { hourlyRate: 100, hours: 2 },
    ],
    consumableLines: [],
    markupPercent: 0,
  });
  assert.equal(result.labourCost.toFixed(2), '350.00');
  assert.equal(result.labourLineCosts[0].toFixed(2), '150.00');
  assert.equal(result.labourLineCosts[1].toFixed(2), '200.00');
});

test('sums multiple consumable lines and reports per-line costs', () => {
  const result = calculateCosting({
    filament: baseFilament,
    printer: basePrinter,
    labourLines: [],
    consumableLines: [
      { costPerUnit: 5, quantity: 3 },
      { costPerUnit: 2.5, quantity: 4 },
    ],
    markupPercent: 0,
  });
  assert.equal(result.consumablesCost.toFixed(2), '25.00');
  assert.equal(result.consumableLineCosts[0].toFixed(2), '15.00');
  assert.equal(result.consumableLineCosts[1].toFixed(2), '10.00');
});

test('total cost sums all five components, and suggested price applies markup', () => {
  const result = calculateCosting({
    filament: { weightGrams: 50, costPerKg: 300, costPerSpool: null, spoolWeightGrams: null }, // 15.00
    printer: { printTimeHours: 2, powerDrawWatts: 200, electricityRatePerKwh: 2.5, purchaseCost: 4000, expectedLifetimeHours: 2000 },
    // electricity: 2h * 0.2kW * 2.5 = 1.00; depreciation: 2h * (4000/2000) = 4.00
    labourLines: [{ hourlyRate: 150, hours: 1 }], // 150.00
    consumableLines: [{ costPerUnit: 10, quantity: 2 }], // 20.00
    markupPercent: 50,
  });
  assert.equal(result.totalCost.toFixed(2), '190.00');
  assert.equal(result.suggestedPrice.toFixed(2), '285.00');
});

test('accepts a Prisma.Decimal instance for electricityRatePerKwh, as a resolved printer record would provide', async () => {
  const { Prisma } = await import('@prisma/client');
  const result = calculateCosting({
    filament: baseFilament,
    printer: {
      printTimeHours: 2,
      powerDrawWatts: 500,
      electricityRatePerKwh: new Prisma.Decimal('2.5000'),
      purchaseCost: 0,
      expectedLifetimeHours: 1000,
    },
    labourLines: [],
    consumableLines: [],
    markupPercent: 0,
  });
  // 2h * 0.5kW * 2.5 = 2.50
  assert.equal(result.electricityCost.toFixed(2), '2.50');
});

test('zero markup leaves suggested price equal to total cost', () => {
  const result = calculateCosting({
    filament: { weightGrams: 10, costPerKg: 100, costPerSpool: null, spoolWeightGrams: null },
    printer: basePrinter,
    labourLines: [],
    consumableLines: [],
    markupPercent: 0,
  });
  assert.equal(result.suggestedPrice.toFixed(2), result.totalCost.toFixed(2));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot find module `../src/costing/calculate.js`.

- [ ] **Step 3: Create `src/costing/calculate.ts`**

```typescript
import { Prisma } from '@prisma/client';

export interface FilamentCostInput {
  weightGrams: number;
  costPerKg: number | null;
  costPerSpool: number | null;
  spoolWeightGrams: number | null;
}

export interface PrinterCostInput {
  printTimeHours: number;
  powerDrawWatts: number;
  electricityRatePerKwh: Prisma.Decimal | number;
  purchaseCost: number;
  expectedLifetimeHours: number;
}

export interface LabourLineInput {
  hourlyRate: number;
  hours: number;
}

export interface ConsumableLineInput {
  costPerUnit: number;
  quantity: number;
}

export interface CostingInput {
  filament: FilamentCostInput;
  printer: PrinterCostInput;
  labourLines: LabourLineInput[];
  consumableLines: ConsumableLineInput[];
  markupPercent: number;
}

export interface CostingResult {
  costPerGram: Prisma.Decimal;
  depreciationPerHour: Prisma.Decimal;
  filamentCost: Prisma.Decimal;
  electricityCost: Prisma.Decimal;
  depreciationCost: Prisma.Decimal;
  labourCost: Prisma.Decimal;
  consumablesCost: Prisma.Decimal;
  totalCost: Prisma.Decimal;
  suggestedPrice: Prisma.Decimal;
  labourLineCosts: Prisma.Decimal[];
  consumableLineCosts: Prisma.Decimal[];
}

export class CostingInputError extends Error {}

function toDecimal(value: number | Prisma.Decimal): Prisma.Decimal {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

export function calculateCosting(input: CostingInput): CostingResult {
  const { filament, printer, labourLines, consumableLines, markupPercent } = input;

  let costPerGram: Prisma.Decimal;
  if (filament.costPerKg != null) {
    costPerGram = toDecimal(filament.costPerKg).dividedBy(1000);
  } else if (filament.costPerSpool != null && filament.spoolWeightGrams) {
    costPerGram = toDecimal(filament.costPerSpool).dividedBy(filament.spoolWeightGrams);
  } else {
    throw new CostingInputError(
      'Filament has no cost data — set a cost per kg, or a cost per spool and spool weight.',
    );
  }
  const filamentCost = costPerGram.times(filament.weightGrams);

  const electricityCost = toDecimal(printer.printTimeHours)
    .times(toDecimal(printer.powerDrawWatts).dividedBy(1000))
    .times(toDecimal(printer.electricityRatePerKwh));

  const depreciationPerHour = toDecimal(printer.purchaseCost).dividedBy(printer.expectedLifetimeHours);
  const depreciationCost = toDecimal(printer.printTimeHours).times(depreciationPerHour);

  const labourLineCosts = labourLines.map((line) => toDecimal(line.hourlyRate).times(line.hours));
  const labourCost = labourLineCosts.reduce((sum, cost) => sum.plus(cost), new Prisma.Decimal(0));

  const consumableLineCosts = consumableLines.map((line) => toDecimal(line.costPerUnit).times(line.quantity));
  const consumablesCost = consumableLineCosts.reduce((sum, cost) => sum.plus(cost), new Prisma.Decimal(0));

  const totalCost = filamentCost
    .plus(electricityCost)
    .plus(depreciationCost)
    .plus(labourCost)
    .plus(consumablesCost);

  const suggestedPrice = totalCost.times(new Prisma.Decimal(1).plus(toDecimal(markupPercent).dividedBy(100)));

  return {
    costPerGram,
    depreciationPerHour,
    filamentCost,
    electricityCost,
    depreciationCost,
    labourCost,
    consumablesCost,
    totalCost,
    suggestedPrice,
    labourLineCosts,
    consumableLineCosts,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add platform/api
git commit -m "Add pure costing calculation function with exact Decimal arithmetic"
```

---

## Task 3: CostingTemplate — schema, persistence, routes

**Files:**
- Modify: `platform/api/prisma/schema.prisma`
- Modify: `platform/api/src/db/scoped.ts`
- Modify: `platform/api/src/app.ts`
- Modify: `platform/api/tests/helpers/testApp.ts`
- Modify: `platform/api/tests/tenant-isolation.test.ts`
- Create: `platform/api/src/routes/costing-templates.ts`
- Test: `platform/api/tests/costing-templates.test.ts`

**Interfaces:**
- Consumes: `calculateCosting`/`CostingInputError` (Task 2), `tenantScope(tenantId).filaments/printers/labourSteps/consumables.findById` (existing), `Printer.electricityRatePerKwh`/`expectedLifetimeHours` (Task 1).
- Produces: `tenantScope(tenantId).costingTemplates` with `{ findMany, findById, create }` — no `update`. Produces `GET/POST /api/costing-templates`, `GET /api/costing-templates/:id`.

- [ ] **Step 1: Add three models — append to `prisma/schema.prisma`**

```prisma
model CostingTemplate {
  id                                    String    @id @default(uuid())
  tenantId                              String
  name                                  String
  filamentId                            String?
  filamentSnapshotBrand                 String?
  filamentSnapshotMaterialType          String?
  filamentSnapshotCostPerGram           Decimal?  @db.Decimal(12, 6)
  weightGrams                           Float
  printerId                             String?
  printerSnapshotName                   String?
  printerSnapshotElectricityRatePerKwh  Decimal?  @db.Decimal(10, 4)
  printerSnapshotDepreciationPerHour    Decimal?  @db.Decimal(12, 4)
  printTimeHours                        Float
  markupPercent                         Decimal   @db.Decimal(6, 2)
  filamentCost                          Decimal   @db.Decimal(12, 2)
  electricityCost                       Decimal   @db.Decimal(12, 2)
  depreciationCost                      Decimal   @db.Decimal(12, 2)
  labourCost                            Decimal   @db.Decimal(12, 2)
  consumablesCost                       Decimal   @db.Decimal(12, 2)
  totalCost                             Decimal   @db.Decimal(12, 2)
  suggestedPrice                        Decimal   @db.Decimal(12, 2)
  createdAt                             DateTime  @default(now()) @db.Timestamptz(3)

  tenant   Tenant    @relation(fields: [tenantId], references: [id])
  filament Filament? @relation(fields: [filamentId], references: [id], onDelete: SetNull)
  printer  Printer?  @relation(fields: [printerId], references: [id], onDelete: SetNull)

  labourLines     CostingLabourLine[]
  consumableLines CostingConsumableLine[]

  @@index([tenantId])
  @@map("costing_templates")
}

model CostingLabourLine {
  id                     String  @id @default(uuid())
  tenantId               String
  costingTemplateId      String
  labourStepId           String?
  labourStepSnapshotName String
  hourlyRateSnapshot     Decimal @db.Decimal(10, 2)
  hours                  Float
  lineCost               Decimal @db.Decimal(12, 2)

  tenant          Tenant          @relation(fields: [tenantId], references: [id])
  costingTemplate CostingTemplate @relation(fields: [costingTemplateId], references: [id])
  labourStep      LabourStep?     @relation(fields: [labourStepId], references: [id], onDelete: SetNull)

  @@index([tenantId])
  @@index([costingTemplateId])
  @@map("costing_labour_lines")
}

model CostingConsumableLine {
  id                      String  @id @default(uuid())
  tenantId                String
  costingTemplateId       String
  consumableId            String?
  consumableSnapshotName  String
  costPerUnitSnapshot     Decimal @db.Decimal(10, 2)
  quantity                Float
  lineCost                Decimal @db.Decimal(12, 2)

  tenant          Tenant          @relation(fields: [tenantId], references: [id])
  costingTemplate CostingTemplate @relation(fields: [costingTemplateId], references: [id])
  consumable      Consumable?     @relation(fields: [consumableId], references: [id], onDelete: SetNull)

  @@index([tenantId])
  @@index([costingTemplateId])
  @@map("costing_consumable_lines")
}
```

Add these back-relation fields to the existing models (each is a one-line
addition alongside that model's other relation array fields, or as its
first relation field if it has none):

- `Tenant`: `costingTemplates CostingTemplate[]`, `costingLabourLines CostingLabourLine[]`, `costingConsumableLines CostingConsumableLine[]`
- `Filament`: `costingTemplates CostingTemplate[]`
- `Printer`: `costingTemplates CostingTemplate[]`
- `LabourStep`: `costingLabourLines CostingLabourLine[]`
- `Consumable`: `costingConsumableLines CostingConsumableLine[]`

- [ ] **Step 2: Run the migration**

Run:
```
npx prisma migrate dev --name add_costing_template
```

- [ ] **Step 3: Write the failing test — `tests/costing-templates.test.ts`**

```typescript
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import { buildApp } from '../src/app.js';
import { resetTestDatabase } from './helpers/testApp.js';
import { prisma } from '../src/db/client.js';
import { costingTemplatesRouter } from '../src/routes/costing-templates.js';

beforeEach(resetTestDatabase);

async function loggedInAgent(app: ReturnType<typeof buildApp>, email = 'jane@acmeprints.co.za') {
  await request(app).post('/api/auth/register').send({
    businessName: 'Acme Prints',
    contactName: 'Jane Doe',
    email,
    password: 'correct horse battery staple',
  });
  const tenant = await prisma.tenant.findUnique({ where: { email } });
  await request(app).post('/api/auth/verify-email').send({ token: tenant?.verificationToken });

  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email, password: 'correct horse battery staple' });
  return agent;
}

async function setUpReferenceData(agent: ReturnType<typeof request.agent>) {
  const filamentRes = await agent.post('/api/filaments').send({
    brand: 'eSun',
    materialType: 'PLA',
    diameterMm: 1.75,
    costPerKg: 300,
  });
  const printerRes = await agent.post('/api/printers').send({
    name: 'Printer 1',
    powerDrawWatts: 200,
    purchaseCost: 4000,
    electricityRatePerKwh: 2.5,
    expectedLifetimeHours: 2000,
  });
  const labourRes = await agent.post('/api/labour-steps').send({ name: 'Slicing', hourlyRate: 150 });
  const consumableRes = await agent.post('/api/consumables').send({
    name: 'Build plate adhesive',
    category: 'build-plate-adhesive',
    unitOfMeasure: 'each',
    costPerUnit: 10,
  });
  return {
    filamentId: filamentRes.body.filament.id as string,
    printerId: printerRes.body.printer.id as string,
    labourStepId: labourRes.body.labourStep.id as string,
    consumableId: consumableRes.body.consumable.id as string,
  };
}

function buildMinimalApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(costingTemplatesRouter);
  return app;
}

test('costing template endpoints require auth', async () => {
  const app = buildMinimalApp();
  const res = await request(app).get('/api/costing-templates');
  assert.equal(res.status, 401);
});

test('POST /api/costing-templates rejects a missing required field', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const res = await agent.post('/api/costing-templates').send({ name: 'Test' });
  assert.equal(res.status, 400);
});

test('POST /api/costing-templates rejects a printer missing electricity rate or lifetime', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const filamentRes = await agent.post('/api/filaments').send({
    brand: 'eSun', materialType: 'PLA', diameterMm: 1.75, costPerKg: 300,
  });
  const printerRes = await agent.post('/api/printers').send({ name: 'Bare printer' });

  const res = await agent.post('/api/costing-templates').send({
    name: 'Test',
    filamentId: filamentRes.body.filament.id,
    weightGrams: 50,
    printerId: printerRes.body.printer.id,
    printTimeHours: 2,
    markupPercent: 20,
    labourLines: [],
    consumableLines: [],
  });
  assert.equal(res.status, 400);
});

test('full create -> get -> list cycle computes correct totals', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const refs = await setUpReferenceData(agent);

  const createRes = await agent.post('/api/costing-templates').send({
    name: 'Phone stand batch',
    filamentId: refs.filamentId,
    weightGrams: 50,
    printerId: refs.printerId,
    printTimeHours: 2,
    markupPercent: 50,
    labourLines: [{ labourStepId: refs.labourStepId, hours: 1 }],
    consumableLines: [{ consumableId: refs.consumableId, quantity: 2 }],
  });
  assert.equal(createRes.status, 201);
  const t = createRes.body.costingTemplate;
  // filament: 50g * (300/1000) = 15.00
  // electricity: 2h * 0.2kW * 2.5 = 1.00
  // depreciation: 2h * (4000/2000) = 4.00
  // labour: 1h * 150 = 150.00
  // consumables: 2 * 10 = 20.00
  // total = 15 + 1 + 4 + 150 + 20 = 190.00
  assert.equal(t.filamentCost, '15.00');
  assert.equal(t.electricityCost, '1.00');
  assert.equal(t.depreciationCost, '4.00');
  assert.equal(t.labourCost, '150.00');
  assert.equal(t.consumablesCost, '20.00');
  assert.equal(t.totalCost, '190.00');
  assert.equal(t.suggestedPrice, '285.00');
  assert.equal(t.labourLines.length, 1);
  assert.equal(t.labourLines[0].lineCost, '150.00');
  assert.equal(t.consumableLines.length, 1);
  assert.equal(t.consumableLines[0].lineCost, '20.00');

  const listRes = await agent.get('/api/costing-templates');
  assert.equal(listRes.status, 200);
  assert.equal(listRes.body.costingTemplates.length, 1);

  const getRes = await agent.get(`/api/costing-templates/${t.id}`);
  assert.equal(getRes.status, 200);
  assert.equal(getRes.body.costingTemplate.totalCost, '190.00');
  assert.equal(getRes.body.costingTemplate.labourLines.length, 1);
});

test('rejects a filament/printer/labour step/consumable belonging to another tenant', async () => {
  const app = buildApp();
  const agentA = await loggedInAgent(app, 'jane@acmeprints.co.za');
  const refsA = await setUpReferenceData(agentA);

  const agentB = await loggedInAgent(app, 'bob@othershop.co.za');
  const res = await agentB.post('/api/costing-templates').send({
    name: 'Stolen reference test',
    filamentId: refsA.filamentId,
    weightGrams: 50,
    printerId: refsA.printerId,
    printTimeHours: 1,
    markupPercent: 0,
    labourLines: [],
    consumableLines: [],
  });
  assert.equal(res.status, 400);
});

test('GET /api/costing-templates/:id returns 404 for another tenant\'s template', async () => {
  const app = buildApp();
  const agentA = await loggedInAgent(app, 'jane@acmeprints.co.za');
  const refsA = await setUpReferenceData(agentA);
  const createRes = await agentA.post('/api/costing-templates').send({
    name: 'Tenant A template',
    filamentId: refsA.filamentId,
    weightGrams: 50,
    printerId: refsA.printerId,
    printTimeHours: 1,
    markupPercent: 0,
    labourLines: [],
    consumableLines: [],
  });

  const agentB = await loggedInAgent(app, 'bob@othershop.co.za');
  const res = await agentB.get(`/api/costing-templates/${createRes.body.costingTemplate.id}`);
  assert.equal(res.status, 404);
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot find module `../src/routes/costing-templates.js`.

- [ ] **Step 5: Extend `src/db/scoped.ts`**

Add these interfaces above `tenantScope`:

```typescript
export interface CreateCostingTemplateLabourLineInput {
  labourStepId: string | null;
  labourStepSnapshotName: string;
  hourlyRateSnapshot: string;
  hours: number;
  lineCost: string;
}

export interface CreateCostingTemplateConsumableLineInput {
  consumableId: string | null;
  consumableSnapshotName: string;
  costPerUnitSnapshot: string;
  quantity: number;
  lineCost: string;
}

export interface CreateCostingTemplateInput {
  name: string;
  filamentId: string | null;
  filamentSnapshotBrand: string | null;
  filamentSnapshotMaterialType: string | null;
  filamentSnapshotCostPerGram: string | null;
  weightGrams: number;
  printerId: string | null;
  printerSnapshotName: string | null;
  printerSnapshotElectricityRatePerKwh: string | null;
  printerSnapshotDepreciationPerHour: string | null;
  printTimeHours: number;
  markupPercent: string;
  filamentCost: string;
  electricityCost: string;
  depreciationCost: string;
  labourCost: string;
  consumablesCost: string;
  totalCost: string;
  suggestedPrice: string;
  labourLines: CreateCostingTemplateLabourLineInput[];
  consumableLines: CreateCostingTemplateConsumableLineInput[];
}
```

Note: every money value here is a `string` (from `Prisma.Decimal#toString()`
in the route), not a `number` — this avoids ever routing a computed
`Decimal` through a lossy JS float on its way into Prisma.

Add a `costingTemplates` key as a sibling of `consumables`:

```typescript
    costingTemplates: {
      findMany: () =>
        prisma.costingTemplate.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } }),

      findById: (id: string) =>
        prisma.costingTemplate.findFirst({
          where: { id, tenantId },
          include: { labourLines: true, consumableLines: true },
        }),

      create: (data: CreateCostingTemplateInput) =>
        prisma.costingTemplate.create({
          data: {
            tenantId,
            name: data.name,
            filamentId: data.filamentId,
            filamentSnapshotBrand: data.filamentSnapshotBrand,
            filamentSnapshotMaterialType: data.filamentSnapshotMaterialType,
            filamentSnapshotCostPerGram: data.filamentSnapshotCostPerGram,
            weightGrams: data.weightGrams,
            printerId: data.printerId,
            printerSnapshotName: data.printerSnapshotName,
            printerSnapshotElectricityRatePerKwh: data.printerSnapshotElectricityRatePerKwh,
            printerSnapshotDepreciationPerHour: data.printerSnapshotDepreciationPerHour,
            printTimeHours: data.printTimeHours,
            markupPercent: data.markupPercent,
            filamentCost: data.filamentCost,
            electricityCost: data.electricityCost,
            depreciationCost: data.depreciationCost,
            labourCost: data.labourCost,
            consumablesCost: data.consumablesCost,
            totalCost: data.totalCost,
            suggestedPrice: data.suggestedPrice,
            labourLines: {
              create: data.labourLines.map((line) => ({
                tenantId,
                labourStepId: line.labourStepId,
                labourStepSnapshotName: line.labourStepSnapshotName,
                hourlyRateSnapshot: line.hourlyRateSnapshot,
                hours: line.hours,
                lineCost: line.lineCost,
              })),
            },
            consumableLines: {
              create: data.consumableLines.map((line) => ({
                tenantId,
                consumableId: line.consumableId,
                consumableSnapshotName: line.consumableSnapshotName,
                costPerUnitSnapshot: line.costPerUnitSnapshot,
                quantity: line.quantity,
                lineCost: line.lineCost,
              })),
            },
          },
          include: { labourLines: true, consumableLines: true },
        }),
    },
```

- [ ] **Step 6: Create `src/routes/costing-templates.ts`**

```typescript
import { Router } from 'express';
import { z } from 'zod';
import { requireTenantAuth } from '../middleware/requireTenantAuth.js';
import { tenantScope } from '../db/scoped.js';
import { calculateCosting, CostingInputError } from '../costing/calculate.js';

export const costingTemplatesRouter = Router();
costingTemplatesRouter.use(requireTenantAuth);

const labourLineSchema = z.object({
  labourStepId: z.string().min(1),
  hours: z.number().positive(),
});

const consumableLineSchema = z.object({
  consumableId: z.string().min(1),
  quantity: z.number().positive(),
});

const createCostingTemplateSchema = z.object({
  name: z.string().min(1),
  filamentId: z.string().min(1),
  weightGrams: z.number().positive(),
  printerId: z.string().min(1),
  printTimeHours: z.number().positive(),
  markupPercent: z.number().min(0),
  labourLines: z.array(labourLineSchema).default([]),
  consumableLines: z.array(consumableLineSchema).default([]),
});

costingTemplatesRouter.get('/api/costing-templates', async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const costingTemplates = await scoped.costingTemplates.findMany();
  res.json({ ok: true, costingTemplates });
});

costingTemplatesRouter.get('/api/costing-templates/:id', async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const costingTemplate = await scoped.costingTemplates.findById(req.params.id);
  if (!costingTemplate) {
    return res.status(404).json({ ok: false, error: 'Costing template not found.' });
  }
  res.json({ ok: true, costingTemplate });
});

costingTemplatesRouter.post('/api/costing-templates', async (req, res) => {
  const parsed = createCostingTemplateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: 'Name, filament, weight, printer, print time, and markup are required.',
    });
  }
  const { name, filamentId, weightGrams, printerId, printTimeHours, markupPercent, labourLines, consumableLines } =
    parsed.data;
  const scoped = tenantScope(req.tenantId!);

  const filament = await scoped.filaments.findById(filamentId);
  if (!filament) {
    return res.status(400).json({ ok: false, error: 'Filament not found.' });
  }

  const printer = await scoped.printers.findById(printerId);
  if (!printer) {
    return res.status(400).json({ ok: false, error: 'Printer not found.' });
  }
  if (printer.electricityRatePerKwh == null || printer.expectedLifetimeHours == null || printer.purchaseCost == null) {
    return res.status(400).json({
      ok: false,
      error:
        'This printer is missing an electricity rate, expected lifetime, or purchase cost — set these before costing a job on it.',
    });
  }
  const electricityRatePerKwh = printer.electricityRatePerKwh;
  const expectedLifetimeHours = printer.expectedLifetimeHours;
  const purchaseCost = printer.purchaseCost;

  const resolvedLabourLines: Array<{ id: string; name: string; hourlyRate: number; hours: number }> = [];
  for (const line of labourLines) {
    const step = await scoped.labourSteps.findById(line.labourStepId);
    if (!step) {
      return res.status(400).json({ ok: false, error: 'One of the labour steps was not found.' });
    }
    resolvedLabourLines.push({ id: step.id, name: step.name, hourlyRate: step.hourlyRate, hours: line.hours });
  }

  const resolvedConsumableLines: Array<{ id: string; name: string; costPerUnit: number; quantity: number }> = [];
  for (const line of consumableLines) {
    const consumable = await scoped.consumables.findById(line.consumableId);
    if (!consumable) {
      return res.status(400).json({ ok: false, error: 'One of the consumables was not found.' });
    }
    resolvedConsumableLines.push({
      id: consumable.id,
      name: consumable.name,
      costPerUnit: consumable.costPerUnit,
      quantity: line.quantity,
    });
  }

  let result;
  try {
    result = calculateCosting({
      filament: {
        weightGrams,
        costPerKg: filament.costPerKg,
        costPerSpool: filament.costPerSpool,
        spoolWeightGrams: filament.spoolWeightGrams,
      },
      printer: {
        printTimeHours,
        powerDrawWatts: printer.powerDrawWatts ?? 0,
        electricityRatePerKwh,
        purchaseCost,
        expectedLifetimeHours,
      },
      labourLines: resolvedLabourLines.map((line) => ({ hourlyRate: line.hourlyRate, hours: line.hours })),
      consumableLines: resolvedConsumableLines.map((line) => ({
        costPerUnit: line.costPerUnit,
        quantity: line.quantity,
      })),
      markupPercent,
    });
  } catch (err) {
    if (err instanceof CostingInputError) {
      return res.status(400).json({ ok: false, error: err.message });
    }
    throw err;
  }

  const costingTemplate = await scoped.costingTemplates.create({
    name,
    filamentId: filament.id,
    filamentSnapshotBrand: filament.brand,
    filamentSnapshotMaterialType: filament.materialType,
    filamentSnapshotCostPerGram: result.costPerGram.toString(),
    weightGrams,
    printerId: printer.id,
    printerSnapshotName: printer.name,
    printerSnapshotElectricityRatePerKwh: electricityRatePerKwh.toString(),
    printerSnapshotDepreciationPerHour: result.depreciationPerHour.toString(),
    printTimeHours,
    markupPercent: markupPercent.toString(),
    filamentCost: result.filamentCost.toString(),
    electricityCost: result.electricityCost.toString(),
    depreciationCost: result.depreciationCost.toString(),
    labourCost: result.labourCost.toString(),
    consumablesCost: result.consumablesCost.toString(),
    totalCost: result.totalCost.toString(),
    suggestedPrice: result.suggestedPrice.toString(),
    labourLines: resolvedLabourLines.map((line, i) => ({
      labourStepId: line.id,
      labourStepSnapshotName: line.name,
      hourlyRateSnapshot: line.hourlyRate.toString(),
      hours: line.hours,
      lineCost: result.labourLineCosts[i].toString(),
    })),
    consumableLines: resolvedConsumableLines.map((line, i) => ({
      consumableId: line.id,
      consumableSnapshotName: line.name,
      costPerUnitSnapshot: line.costPerUnit.toString(),
      quantity: line.quantity,
      lineCost: result.consumableLineCosts[i].toString(),
    })),
  });

  res.status(201).json({ ok: true, costingTemplate });
});
```

- [ ] **Step 7: Wire the router into `src/app.ts`**

Add the import:
```typescript
import { costingTemplatesRouter } from './routes/costing-templates.js';
```
Add after `app.use(consumablesRouter);`:
```typescript
  app.use(costingTemplatesRouter);
```

- [ ] **Step 8: Extend `resetTestDatabase()` in `tests/helpers/testApp.ts`**

Add these three lines as the new first lines of the function (the two
line-item tables must be deleted before `CostingTemplate`, which must be
deleted before `Tenant`):

```typescript
export async function resetTestDatabase() {
  await prisma.costingLabourLine.deleteMany();
  await prisma.costingConsumableLine.deleteMany();
  await prisma.costingTemplate.deleteMany();
  await prisma.printerMaintenanceLog.deleteMany();
  await prisma.printerPreset.deleteMany();
  await prisma.printer.deleteMany();
  await prisma.filament.deleteMany();
  await prisma.labourStep.deleteMany();
  await prisma.consumable.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.session.deleteMany();
  await prisma.tenant.deleteMany();
  await prisma.platformAdmin.deleteMany();
}
```

- [ ] **Step 9: Add a wrapper-level isolation test — append to `tests/tenant-isolation.test.ts`**

Read the existing tests in that file for the exact `makeTenant()` /
`tenantScope()` pattern before writing this one. Add:

```typescript
test('a tenant cannot see another tenant\'s costing templates', async () => {
  const tenantA = await makeTenant('a@example.co.za');
  const tenantB = await makeTenant('b@example.co.za');

  const scopedA = tenantScope(tenantA.id);
  const scopedB = tenantScope(tenantB.id);

  await scopedA.costingTemplates.create({
    name: 'Tenant A template',
    filamentId: null,
    filamentSnapshotBrand: null,
    filamentSnapshotMaterialType: null,
    filamentSnapshotCostPerGram: null,
    weightGrams: 10,
    printerId: null,
    printerSnapshotName: null,
    printerSnapshotElectricityRatePerKwh: null,
    printerSnapshotDepreciationPerHour: null,
    printTimeHours: 1,
    markupPercent: '0',
    filamentCost: '1.00',
    electricityCost: '0.00',
    depreciationCost: '0.00',
    labourCost: '0.00',
    consumablesCost: '0.00',
    totalCost: '1.00',
    suggestedPrice: '1.00',
    labourLines: [],
    consumableLines: [],
  });

  const aList = await scopedA.costingTemplates.findMany();
  const bList = await scopedB.costingTemplates.findMany();

  assert.equal(aList.length, 1);
  assert.equal(bList.length, 0);

  const bFindById = await scopedB.costingTemplates.findById(aList[0].id);
  assert.equal(bFindById, null);
});
```

- [ ] **Step 10: Run tests to verify they pass**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 11: Run typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 12: Commit**

```bash
git add platform/api
git commit -m "Add CostingTemplate: resolves references, calculates, persists a cost snapshot"
```

---

## Self-Review Notes

- **Spec coverage:** SRS §4.10's every stated cost component (filament,
  electricity, depreciation, labour, consumables, markup, total,
  suggested price) is computed by `calculateCosting` and exercised by
  Task 2's unit tests. The filament fallback (costPerKg vs.
  costPerSpool/spoolWeightGrams) and the "no cost data" rejection are
  both covered. "Reusable Costing Template" — Task 3's persisted
  snapshot. Not covered by this plan (intentionally, per the spec):
  quotes/invoices, any frontend, editing/duplicating a template.
- **Placeholder scan:** no TBD/TODO markers; every step has complete
  code.
- **Type consistency:** `calculateCosting`'s exact signature and every
  field of `CostingResult` (including `costPerGram`/`depreciationPerHour`,
  which Task 3 reuses rather than recomputing) are defined once in Task 2
  and consumed unchanged in Task 3. `CreateCostingTemplateInput`'s money
  fields are `string` throughout (never `number`), consistently avoiding
  a float round-trip between the `Decimal` result and Prisma. The
  nested-resource pattern (verify-before-use, tenant-scoped `findById`
  calls) matches the discipline the reference-data-modules plan
  established for printer presets/maintenance logs, applied here across
  four different reference types in one request instead of one parent.
