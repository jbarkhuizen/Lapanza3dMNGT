# Reference Data Modules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tenant-scoped CRUD for the four remaining Phase 1 reference-data modules — printers (with per-printer presets and a maintenance log), filament, labour rates, and consumables — extending the pattern Foundation established with Customers.

**Architecture:** Same Express + Prisma + `tenantScope` pattern as Foundation's Customer module. Six new Prisma models, all carrying `tenantId` directly (including the two printer-child tables — no join-based scoping), all queried only through `tenantScope`. Printer presets and maintenance-log routes nest under `/api/printers/:printerId/...` and verify the parent printer belongs to the calling tenant before touching child rows.

**Tech Stack:** Same as Foundation — Node 20+, TypeScript strict, Express 5, Prisma + PostgreSQL, zod, Node's built-in test runner + supertest.

## Global Constraints

- All the constraints from `docs/superpowers/plans/2026-09-06-platform-foundation.md` still apply (response shape `{ ok: true, ... }` / `{ ok: false, error }`, sentence-case errors, no `any`, ESM, npm).
- **Every `DateTime` field gets `@db.Timestamptz(3)` from the start** — Foundation's Task 2 missed this and had to fix it after review; every model in this plan already has it in the schema shown below.
- **Every `update()` method in `scoped.ts` strips `tenantId` (and, for nested resources, `printerId`) from its `data` argument** from the start — Foundation's Task 6 added this after review; every wrapper method below already has it.
- **`barkie` Postgres role now has `CREATEDB`** (granted after Foundation's Task 2) — `npx prisma migrate dev --name <x>` works directly in this plan, no workaround needed.
- **Tests authenticate through the real HTTP auth flow** (register → verify-email → login, exactly as Foundation's `tests/customers.test.ts` already does), never by hand-constructing a session cookie — that keeps tests exercising the real path and avoids depending on supertest/superagent cookie-jar internals that aren't part of this codebase's proven surface.
- Directory root: `platform/api/` (same project as Foundation — this plan extends it, no new scaffold).
- Run tests with `npm test` from `platform/api/` (already wired to `.env.test` / `barkie_test` via `--env-file`, already serialized via `--test-concurrency=1`).

---

## File Structure

```
platform/api/
  prisma/schema.prisma          # MODIFY — 6 new models appended, one migration per task
  src/
    db/scoped.ts                 # MODIFY — one new resource group per task
    routes/
      printers.ts                 # NEW (Task 1) — printer CRUD
      printer-presets.ts           # NEW (Task 2) — nested preset CRUD
      printer-maintenance.ts        # NEW (Task 3) — nested maintenance log (create+list only)
      filaments.ts                  # NEW (Task 4)
      labour-steps.ts                # NEW (Task 5)
      consumables.ts                  # NEW (Task 6)
    app.ts                        # MODIFY — mount each new router as its task lands
  tests/
    helpers/testApp.ts            # MODIFY — resetTestDatabase() grows by one deleteMany per task
    printers.test.ts               # NEW (Task 1)
    printer-presets.test.ts         # NEW (Task 2)
    printer-maintenance.test.ts      # NEW (Task 3)
    filaments.test.ts                 # NEW (Task 4)
    labour-steps.test.ts               # NEW (Task 5)
    consumables.test.ts                 # NEW (Task 6)
```

Each new route file has one clear responsibility (one resource group's HTTP
surface), matching `routes/customers.ts`'s existing shape exactly so the
pattern stays recognizable across the whole API.

---

## Task 1: Printer CRUD

**Files:**
- Modify: `platform/api/prisma/schema.prisma`
- Modify: `platform/api/src/db/scoped.ts`
- Modify: `platform/api/src/app.ts`
- Modify: `platform/api/tests/helpers/testApp.ts`
- Create: `platform/api/src/routes/printers.ts`
- Test: `platform/api/tests/printers.test.ts`

**Interfaces:**
- Consumes: `tenantScope` (existing), `requireTenantAuth` (existing), `prisma` client (existing).
- Produces: `tenantScope(tenantId).printers` with `{ findMany, findById, create, update }` — Task 2 and Task 3 depend on `printers.findById` to verify parent-printer ownership. Produces `GET/POST /api/printers`, `GET/PATCH /api/printers/:id`.

- [ ] **Step 1: Add the `Printer` model — append to `prisma/schema.prisma`**

```prisma
model Printer {
  id               String    @id @default(uuid())
  tenantId         String
  name             String
  make             String?
  model            String?
  buildVolumeXMm   Float?
  buildVolumeYMm   Float?
  buildVolumeZMm   Float?
  purchaseDate     DateTime? @db.Timestamptz(3)
  purchaseCost     Float?
  powerDrawWatts   Float?
  status           String    @default("active")
  createdAt        DateTime  @default(now()) @db.Timestamptz(3)

  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@index([tenantId])
  @@map("printers")
}
```

Add `printers Printer[]` to the `Tenant` model, alongside the existing
`customers Customer[]` line.

- [ ] **Step 2: Run the migration**

Run (from `platform/api/`):
```
npx prisma migrate dev --name add_printer
```
Expected: creates a new migration directory, prints "Your database is now
in sync with your schema."

- [ ] **Step 3: Write the failing test — `tests/printers.test.ts`**

```typescript
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildApp } from '../src/app.js';
import { resetTestDatabase } from './helpers/testApp.js';
import { prisma } from '../src/db/client.js';

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

test('printer endpoints require auth', async () => {
  const app = buildApp();
  const res = await request(app).get('/api/printers');
  assert.equal(res.status, 401);
});

test('POST /api/printers rejects a missing required field', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const res = await agent.post('/api/printers').send({});
  assert.equal(res.status, 400);
});

test('full create -> list -> get -> update cycle', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);

  const createRes = await agent.post('/api/printers').send({
    name: 'Printer 1 — Ender 3 V2',
    make: 'Creality',
    model: 'Ender 3 V2',
    buildVolumeXMm: 220,
    buildVolumeYMm: 220,
    buildVolumeZMm: 250,
    powerDrawWatts: 360,
  });
  assert.equal(createRes.status, 201);
  assert.equal(createRes.body.printer.status, 'active');
  const printerId = createRes.body.printer.id;

  const listRes = await agent.get('/api/printers');
  assert.equal(listRes.status, 200);
  assert.equal(listRes.body.printers.length, 1);

  const getRes = await agent.get(`/api/printers/${printerId}`);
  assert.equal(getRes.status, 200);
  assert.equal(getRes.body.printer.make, 'Creality');

  const updateRes = await agent.patch(`/api/printers/${printerId}`).send({ status: 'maintenance' });
  assert.equal(updateRes.status, 200);

  const getAfterUpdate = await agent.get(`/api/printers/${printerId}`);
  assert.equal(getAfterUpdate.body.printer.status, 'maintenance');
});

test('GET /api/printers/:id returns 404 for another tenant\'s printer', async () => {
  const app = buildApp();
  const agentA = await loggedInAgent(app, 'jane@acmeprints.co.za');
  const agentB = await loggedInAgent(app, 'bob@othershop.co.za');

  const createRes = await agentA.post('/api/printers').send({ name: 'Printer 1' });
  const res = await agentB.get(`/api/printers/${createRes.body.printer.id}`);
  assert.equal(res.status, 404);
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — all `/api/printers` requests 404 (route doesn't exist yet).

- [ ] **Step 5: Extend `src/db/scoped.ts`** — add above the closing `}` of the returned object, after the `customers` block:

```typescript
export interface CreatePrinterInput {
  name: string;
  make?: string;
  model?: string;
  buildVolumeXMm?: number;
  buildVolumeYMm?: number;
  buildVolumeZMm?: number;
  purchaseDate?: string;
  purchaseCost?: number;
  powerDrawWatts?: number;
  status?: string;
}

export interface UpdatePrinterInput {
  name?: string;
  make?: string;
  model?: string;
  buildVolumeXMm?: number;
  buildVolumeYMm?: number;
  buildVolumeZMm?: number;
  purchaseDate?: string;
  purchaseCost?: number;
  powerDrawWatts?: number;
  status?: string;
}
```

Add these interfaces above `export function tenantScope`, alongside the
existing `CreateCustomerInput`/`UpdateCustomerInput`. Then add a `printers`
key to the object `tenantScope` returns, as a sibling of `customers`:

```typescript
    printers: {
      findMany: () => prisma.printer.findMany({ where: { tenantId } }),

      findById: (id: string) => prisma.printer.findFirst({ where: { id, tenantId } }),

      create: (data: CreatePrinterInput) =>
        prisma.printer.create({
          data: {
            ...data,
            purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : undefined,
            tenantId,
          },
        }),

      update: (id: string, data: UpdatePrinterInput) =>
        prisma.printer.updateMany({
          where: { id, tenantId },
          data: {
            ...data,
            purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : undefined,
            tenantId: undefined,
          },
        }),
    },
```

- [ ] **Step 6: Create `src/routes/printers.ts`**

```typescript
import { Router } from 'express';
import { z } from 'zod';
import { requireTenantAuth } from '../middleware/requireTenantAuth.js';
import { tenantScope } from '../db/scoped.js';

export const printersRouter = Router();
printersRouter.use(requireTenantAuth);

const STATUSES = ['active', 'maintenance', 'retired'] as const;

const createPrinterSchema = z.object({
  name: z.string().min(1),
  make: z.string().optional(),
  model: z.string().optional(),
  buildVolumeXMm: z.number().optional(),
  buildVolumeYMm: z.number().optional(),
  buildVolumeZMm: z.number().optional(),
  purchaseDate: z.string().optional(),
  purchaseCost: z.number().optional(),
  powerDrawWatts: z.number().optional(),
  status: z.enum(STATUSES).optional(),
});

const updatePrinterSchema = createPrinterSchema.partial();

printersRouter.get('/api/printers', async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const printers = await scoped.printers.findMany();
  res.json({ ok: true, printers });
});

printersRouter.post('/api/printers', async (req, res) => {
  const parsed = createPrinterSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: 'Printer name is required.' });
  }
  const scoped = tenantScope(req.tenantId!);
  const printer = await scoped.printers.create(parsed.data);
  res.status(201).json({ ok: true, printer });
});

printersRouter.get('/api/printers/:id', async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const printer = await scoped.printers.findById(req.params.id);
  if (!printer) {
    return res.status(404).json({ ok: false, error: 'Printer not found.' });
  }
  res.json({ ok: true, printer });
});

printersRouter.patch('/api/printers/:id', async (req, res) => {
  const parsed = updatePrinterSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: 'Invalid printer fields.' });
  }
  const scoped = tenantScope(req.tenantId!);
  const result = await scoped.printers.update(req.params.id, parsed.data);
  if (result.count === 0) {
    return res.status(404).json({ ok: false, error: 'Printer not found.' });
  }
  res.json({ ok: true });
});
```

- [ ] **Step 7: Wire the router into `src/app.ts`**

Add the import alongside the existing route imports:
```typescript
import { printersRouter } from './routes/printers.js';
```
Add after `app.use(customersRouter);`:
```typescript
  app.use(printersRouter);
```

- [ ] **Step 8: Extend `resetTestDatabase()` in `tests/helpers/testApp.ts`**

Add `await prisma.printer.deleteMany();` as the FIRST line of the function
(before `customer.deleteMany()` — printers must be deleted before tenants,
and order relative to customers doesn't matter since neither references
the other):

```typescript
import { prisma } from '../../src/db/client.js';

export async function resetTestDatabase() {
  await prisma.printer.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.session.deleteMany();
  await prisma.tenant.deleteMany();
  await prisma.platformAdmin.deleteMany();
}
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 10: Commit**

```bash
git add platform/api
git commit -m "Add Printer CRUD endpoints behind tenant auth"
```

---

## Task 2: Printer presets (nested)

**Files:**
- Modify: `platform/api/prisma/schema.prisma`
- Modify: `platform/api/src/db/scoped.ts`
- Modify: `platform/api/src/app.ts`
- Modify: `platform/api/tests/helpers/testApp.ts`
- Create: `platform/api/src/routes/printer-presets.ts`
- Test: `platform/api/tests/printer-presets.test.ts`

**Interfaces:**
- Consumes: `tenantScope(tenantId).printers.findById` (Task 1) — used to verify the parent printer belongs to the calling tenant before any preset operation. `POST /api/printers` (Task 1) — the test helper creates its printer through this real endpoint rather than touching Prisma directly.
- Produces: `tenantScope(tenantId).printerPresets` with `{ findMany(printerId), findById(printerId, id), create(printerId, data), update(printerId, id, data) }`. Produces `GET/POST /api/printers/:printerId/presets`, `PATCH /api/printers/:printerId/presets/:id`.

- [ ] **Step 1: Add the `PrinterPreset` model — append to `prisma/schema.prisma`**

```prisma
model PrinterPreset {
  id              String   @id @default(uuid())
  tenantId        String
  printerId       String
  name            String
  materialType    String
  nozzleTempC     Float?
  bedTempC        Float?
  printSpeedMmS   Float?
  layerHeightMm   Float?
  infillPercent   Float?
  notes           String?
  createdAt       DateTime @default(now()) @db.Timestamptz(3)

  tenant  Tenant  @relation(fields: [tenantId], references: [id])
  printer Printer @relation(fields: [printerId], references: [id])

  @@index([tenantId])
  @@index([printerId])
  @@map("printer_presets")
}
```

Add `printerPresets PrinterPreset[]` to both `Tenant` and `Printer` models
(alongside their existing relation array fields).

- [ ] **Step 2: Run the migration**

Run:
```
npx prisma migrate dev --name add_printer_preset
```

- [ ] **Step 3: Write the failing test — `tests/printer-presets.test.ts`**

```typescript
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildApp } from '../src/app.js';
import { resetTestDatabase } from './helpers/testApp.js';
import { prisma } from '../src/db/client.js';

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

async function loggedInAgentWithPrinter(app: ReturnType<typeof buildApp>, email = 'jane@acmeprints.co.za') {
  const agent = await loggedInAgent(app, email);
  const printerRes = await agent.post('/api/printers').send({ name: 'Printer 1' });
  return { agent, printerId: printerRes.body.printer.id as string };
}

test('preset endpoints require auth', async () => {
  const app = buildApp();
  const res = await request(app).get('/api/printers/does-not-matter/presets');
  assert.equal(res.status, 401);
});

test('POST /api/printers/:printerId/presets returns 404 for a printer belonging to another tenant', async () => {
  const app = buildApp();
  const { printerId } = await loggedInAgentWithPrinter(app, 'jane@acmeprints.co.za');
  const agentB = await loggedInAgent(app, 'bob@othershop.co.za');

  const res = await agentB.post(`/api/printers/${printerId}/presets`).send({
    name: 'PLA — Standard',
    materialType: 'PLA',
  });
  assert.equal(res.status, 404);
});

test('full create -> list -> update cycle, scoped to the printer', async () => {
  const app = buildApp();
  const { agent, printerId } = await loggedInAgentWithPrinter(app);

  const createRes = await agent.post(`/api/printers/${printerId}/presets`).send({
    name: 'PLA — Standard',
    materialType: 'PLA',
    nozzleTempC: 210,
    bedTempC: 60,
    infillPercent: 20,
  });
  assert.equal(createRes.status, 201);
  const presetId = createRes.body.preset.id;

  const listRes = await agent.get(`/api/printers/${printerId}/presets`);
  assert.equal(listRes.status, 200);
  assert.equal(listRes.body.presets.length, 1);

  const updateRes = await agent
    .patch(`/api/printers/${printerId}/presets/${presetId}`)
    .send({ infillPercent: 35 });
  assert.equal(updateRes.status, 200);

  const listAfterUpdate = await agent.get(`/api/printers/${printerId}/presets`);
  assert.equal(listAfterUpdate.body.presets[0].infillPercent, 35);
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — all `/api/printers/:printerId/presets` requests 404.

- [ ] **Step 5: Extend `src/db/scoped.ts`**

Add interfaces above `tenantScope`:

```typescript
export interface CreatePrinterPresetInput {
  name: string;
  materialType: string;
  nozzleTempC?: number;
  bedTempC?: number;
  printSpeedMmS?: number;
  layerHeightMm?: number;
  infillPercent?: number;
  notes?: string;
}

export interface UpdatePrinterPresetInput {
  name?: string;
  materialType?: string;
  nozzleTempC?: number;
  bedTempC?: number;
  printSpeedMmS?: number;
  layerHeightMm?: number;
  infillPercent?: number;
  notes?: string;
}
```

Add a `printerPresets` key as a sibling of `printers`:

```typescript
    printerPresets: {
      findMany: (printerId: string) =>
        prisma.printerPreset.findMany({ where: { printerId, tenantId } }),

      findById: (printerId: string, id: string) =>
        prisma.printerPreset.findFirst({ where: { id, printerId, tenantId } }),

      create: (printerId: string, data: CreatePrinterPresetInput) =>
        prisma.printerPreset.create({ data: { ...data, printerId, tenantId } }),

      update: (printerId: string, id: string, data: UpdatePrinterPresetInput) =>
        prisma.printerPreset.updateMany({
          where: { id, printerId, tenantId },
          data: { ...data, tenantId: undefined, printerId: undefined },
        }),
    },
```

- [ ] **Step 6: Create `src/routes/printer-presets.ts`**

```typescript
import { Router } from 'express';
import { z } from 'zod';
import { requireTenantAuth } from '../middleware/requireTenantAuth.js';
import { tenantScope } from '../db/scoped.js';

export const printerPresetsRouter = Router();
printerPresetsRouter.use(requireTenantAuth);

const createPresetSchema = z.object({
  name: z.string().min(1),
  materialType: z.string().min(1),
  nozzleTempC: z.number().optional(),
  bedTempC: z.number().optional(),
  printSpeedMmS: z.number().optional(),
  layerHeightMm: z.number().optional(),
  infillPercent: z.number().min(0).max(100).optional(),
  notes: z.string().optional(),
});

const updatePresetSchema = createPresetSchema.partial();

async function requireOwnedPrinter(tenantId: string, printerId: string) {
  const scoped = tenantScope(tenantId);
  return scoped.printers.findById(printerId);
}

printerPresetsRouter.get('/api/printers/:printerId/presets', async (req, res) => {
  const printer = await requireOwnedPrinter(req.tenantId!, req.params.printerId);
  if (!printer) {
    return res.status(404).json({ ok: false, error: 'Printer not found.' });
  }
  const scoped = tenantScope(req.tenantId!);
  const presets = await scoped.printerPresets.findMany(req.params.printerId);
  res.json({ ok: true, presets });
});

printerPresetsRouter.post('/api/printers/:printerId/presets', async (req, res) => {
  const printer = await requireOwnedPrinter(req.tenantId!, req.params.printerId);
  if (!printer) {
    return res.status(404).json({ ok: false, error: 'Printer not found.' });
  }
  const parsed = createPresetSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: 'Preset name and material type are required.' });
  }
  const scoped = tenantScope(req.tenantId!);
  const preset = await scoped.printerPresets.create(req.params.printerId, parsed.data);
  res.status(201).json({ ok: true, preset });
});

printerPresetsRouter.patch('/api/printers/:printerId/presets/:id', async (req, res) => {
  const printer = await requireOwnedPrinter(req.tenantId!, req.params.printerId);
  if (!printer) {
    return res.status(404).json({ ok: false, error: 'Printer not found.' });
  }
  const parsed = updatePresetSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: 'Invalid preset fields.' });
  }
  const scoped = tenantScope(req.tenantId!);
  const result = await scoped.printerPresets.update(req.params.printerId, req.params.id, parsed.data);
  if (result.count === 0) {
    return res.status(404).json({ ok: false, error: 'Preset not found.' });
  }
  res.json({ ok: true });
});
```

- [ ] **Step 7: Wire the router into `src/app.ts`**

Add the import and mount it after `app.use(printersRouter);`:
```typescript
import { printerPresetsRouter } from './routes/printer-presets.js';
```
```typescript
  app.use(printerPresetsRouter);
```

- [ ] **Step 8: Extend `resetTestDatabase()`**

Add `await prisma.printerPreset.deleteMany();` as the new first line
(before `printer.deleteMany()` — presets reference printers):

```typescript
export async function resetTestDatabase() {
  await prisma.printerPreset.deleteMany();
  await prisma.printer.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.session.deleteMany();
  await prisma.tenant.deleteMany();
  await prisma.platformAdmin.deleteMany();
}
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 10: Commit**

```bash
git add platform/api
git commit -m "Add nested Printer Preset CRUD with parent-ownership checks"
```

---

## Task 3: Printer maintenance log (nested, append-only)

**Files:**
- Modify: `platform/api/prisma/schema.prisma`
- Modify: `platform/api/src/db/scoped.ts`
- Modify: `platform/api/src/app.ts`
- Modify: `platform/api/tests/helpers/testApp.ts`
- Create: `platform/api/src/routes/printer-maintenance.ts`
- Test: `platform/api/tests/printer-maintenance.test.ts`

**Interfaces:**
- Consumes: `tenantScope(tenantId).printers.findById` (Task 1). `POST /api/printers` (Task 1) for the test helper.
- Produces: `tenantScope(tenantId).printerMaintenanceLogs` with `{ findMany(printerId), create(printerId, data) }` — no `update`, deliberately (append-only, per the design spec). Produces `GET/POST /api/printers/:printerId/maintenance-log`.

- [ ] **Step 1: Add the `PrinterMaintenanceLog` model — append to `prisma/schema.prisma`**

```prisma
model PrinterMaintenanceLog {
  id           String   @id @default(uuid())
  tenantId     String
  printerId    String
  date         DateTime @db.Timestamptz(3)
  description  String
  cost         Float?
  performedBy  String?
  createdAt    DateTime @default(now()) @db.Timestamptz(3)

  tenant  Tenant  @relation(fields: [tenantId], references: [id])
  printer Printer @relation(fields: [printerId], references: [id])

  @@index([tenantId])
  @@index([printerId])
  @@map("printer_maintenance_logs")
}
```

Add `printerMaintenanceLogs PrinterMaintenanceLog[]` to both `Tenant` and
`Printer` models.

- [ ] **Step 2: Run the migration**

Run:
```
npx prisma migrate dev --name add_printer_maintenance_log
```

- [ ] **Step 3: Write the failing test — `tests/printer-maintenance.test.ts`**

```typescript
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildApp } from '../src/app.js';
import { resetTestDatabase } from './helpers/testApp.js';
import { prisma } from '../src/db/client.js';

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

async function loggedInAgentWithPrinter(app: ReturnType<typeof buildApp>, email = 'jane@acmeprints.co.za') {
  const agent = await loggedInAgent(app, email);
  const printerRes = await agent.post('/api/printers').send({ name: 'Printer 1' });
  return { agent, printerId: printerRes.body.printer.id as string };
}

test('maintenance log endpoints require auth', async () => {
  const app = buildApp();
  const res = await request(app).get('/api/printers/does-not-matter/maintenance-log');
  assert.equal(res.status, 401);
});

test('create -> list cycle', async () => {
  const app = buildApp();
  const { agent, printerId } = await loggedInAgentWithPrinter(app);

  const createRes = await agent.post(`/api/printers/${printerId}/maintenance-log`).send({
    date: '2026-09-01',
    description: 'Replaced nozzle',
    cost: 150,
    performedBy: 'Jane',
  });
  assert.equal(createRes.status, 201);

  const listRes = await agent.get(`/api/printers/${printerId}/maintenance-log`);
  assert.equal(listRes.status, 200);
  assert.equal(listRes.body.entries.length, 1);
  assert.equal(listRes.body.entries[0].description, 'Replaced nozzle');
});

test('POST rejects a missing required field', async () => {
  const app = buildApp();
  const { agent, printerId } = await loggedInAgentWithPrinter(app);
  const res = await agent.post(`/api/printers/${printerId}/maintenance-log`).send({ cost: 50 });
  assert.equal(res.status, 400);
});

test('returns 404 for a printer belonging to another tenant', async () => {
  const app = buildApp();
  const { printerId } = await loggedInAgentWithPrinter(app, 'jane@acmeprints.co.za');
  const agentB = await loggedInAgent(app, 'bob@othershop.co.za');

  const res = await agentB.get(`/api/printers/${printerId}/maintenance-log`);
  assert.equal(res.status, 404);
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — 404 on the new routes.

- [ ] **Step 5: Extend `src/db/scoped.ts`**

Add interfaces:

```typescript
export interface CreateMaintenanceLogInput {
  date: string;
  description: string;
  cost?: number;
  performedBy?: string;
}
```

Add a `printerMaintenanceLogs` key as a sibling of `printerPresets`:

```typescript
    printerMaintenanceLogs: {
      findMany: (printerId: string) =>
        prisma.printerMaintenanceLog.findMany({
          where: { printerId, tenantId },
          orderBy: { date: 'desc' },
        }),

      create: (printerId: string, data: CreateMaintenanceLogInput) =>
        prisma.printerMaintenanceLog.create({
          data: { ...data, date: new Date(data.date), printerId, tenantId },
        }),
    },
```

- [ ] **Step 6: Create `src/routes/printer-maintenance.ts`**

```typescript
import { Router } from 'express';
import { z } from 'zod';
import { requireTenantAuth } from '../middleware/requireTenantAuth.js';
import { tenantScope } from '../db/scoped.js';

export const printerMaintenanceRouter = Router();
printerMaintenanceRouter.use(requireTenantAuth);

const createMaintenanceLogSchema = z.object({
  date: z.string().min(1),
  description: z.string().min(1),
  cost: z.number().optional(),
  performedBy: z.string().optional(),
});

async function requireOwnedPrinter(tenantId: string, printerId: string) {
  const scoped = tenantScope(tenantId);
  return scoped.printers.findById(printerId);
}

printerMaintenanceRouter.get('/api/printers/:printerId/maintenance-log', async (req, res) => {
  const printer = await requireOwnedPrinter(req.tenantId!, req.params.printerId);
  if (!printer) {
    return res.status(404).json({ ok: false, error: 'Printer not found.' });
  }
  const scoped = tenantScope(req.tenantId!);
  const entries = await scoped.printerMaintenanceLogs.findMany(req.params.printerId);
  res.json({ ok: true, entries });
});

printerMaintenanceRouter.post('/api/printers/:printerId/maintenance-log', async (req, res) => {
  const printer = await requireOwnedPrinter(req.tenantId!, req.params.printerId);
  if (!printer) {
    return res.status(404).json({ ok: false, error: 'Printer not found.' });
  }
  const parsed = createMaintenanceLogSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: 'Date and description are required.' });
  }
  const scoped = tenantScope(req.tenantId!);
  const entry = await scoped.printerMaintenanceLogs.create(req.params.printerId, parsed.data);
  res.status(201).json({ ok: true, entry });
});
```

- [ ] **Step 7: Wire the router into `src/app.ts`**

```typescript
import { printerMaintenanceRouter } from './routes/printer-maintenance.js';
```
```typescript
  app.use(printerMaintenanceRouter);
```

- [ ] **Step 8: Extend `resetTestDatabase()`**

Add `await prisma.printerMaintenanceLog.deleteMany();` as the new first
line:

```typescript
export async function resetTestDatabase() {
  await prisma.printerMaintenanceLog.deleteMany();
  await prisma.printerPreset.deleteMany();
  await prisma.printer.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.session.deleteMany();
  await prisma.tenant.deleteMany();
  await prisma.platformAdmin.deleteMany();
}
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 10: Commit**

```bash
git add platform/api
git commit -m "Add append-only Printer Maintenance Log with parent-ownership checks"
```

---

## Task 4: Filament CRUD

**Files:**
- Modify: `platform/api/prisma/schema.prisma`
- Modify: `platform/api/src/db/scoped.ts`
- Modify: `platform/api/src/app.ts`
- Modify: `platform/api/tests/helpers/testApp.ts`
- Create: `platform/api/src/routes/filaments.ts`
- Test: `platform/api/tests/filaments.test.ts`

**Interfaces:**
- Consumes: `tenantScope` (extending it), `requireTenantAuth`.
- Produces: `tenantScope(tenantId).filaments` with `{ findMany, findById, create, update }`. Produces `GET/POST /api/filaments`, `GET/PATCH /api/filaments/:id`. The costing engine (a later slice) will read `costPerKg` and `remainingWeightGrams` from this model — don't rename these fields without checking for that later dependency.

- [ ] **Step 1: Add the `Filament` model — append to `prisma/schema.prisma`**

```prisma
model Filament {
  id                     String    @id @default(uuid())
  tenantId               String
  brand                  String
  materialType           String
  colour                 String?
  diameterMm             Float
  costPerSpool           Float?
  costPerKg              Float?
  spoolWeightGrams       Float?
  remainingWeightGrams   Float?
  supplier               String?
  purchaseDate           DateTime? @db.Timestamptz(3)
  notes                  String?
  lowStockThresholdGrams Float?
  createdAt              DateTime  @default(now()) @db.Timestamptz(3)

  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@index([tenantId])
  @@map("filaments")
}
```

Add `filaments Filament[]` to the `Tenant` model.

- [ ] **Step 2: Run the migration**

Run:
```
npx prisma migrate dev --name add_filament
```

- [ ] **Step 3: Write the failing test — `tests/filaments.test.ts`**

```typescript
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildApp } from '../src/app.js';
import { resetTestDatabase } from './helpers/testApp.js';
import { prisma } from '../src/db/client.js';

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

test('filament endpoints require auth', async () => {
  const app = buildApp();
  const res = await request(app).get('/api/filaments');
  assert.equal(res.status, 401);
});

test('POST /api/filaments rejects an invalid diameter', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const res = await agent.post('/api/filaments').send({
    brand: 'eSun',
    materialType: 'PLA',
    diameterMm: 3.0,
  });
  assert.equal(res.status, 400);
});

test('full create -> list -> get -> update cycle', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);

  const createRes = await agent.post('/api/filaments').send({
    brand: 'eSun',
    materialType: 'PLA',
    colour: 'Black',
    diameterMm: 1.75,
    costPerKg: 350,
    spoolWeightGrams: 1000,
    remainingWeightGrams: 1000,
  });
  assert.equal(createRes.status, 201);
  const filamentId = createRes.body.filament.id;

  const listRes = await agent.get('/api/filaments');
  assert.equal(listRes.status, 200);
  assert.equal(listRes.body.filaments.length, 1);

  const updateRes = await agent
    .patch(`/api/filaments/${filamentId}`)
    .send({ remainingWeightGrams: 640 });
  assert.equal(updateRes.status, 200);

  const getRes = await agent.get(`/api/filaments/${filamentId}`);
  assert.equal(getRes.body.filament.remainingWeightGrams, 640);
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test`
Expected: FAIL.

- [ ] **Step 5: Extend `src/db/scoped.ts`**

Add interfaces:

```typescript
export interface CreateFilamentInput {
  brand: string;
  materialType: string;
  diameterMm: number;
  colour?: string;
  costPerSpool?: number;
  costPerKg?: number;
  spoolWeightGrams?: number;
  remainingWeightGrams?: number;
  supplier?: string;
  purchaseDate?: string;
  notes?: string;
  lowStockThresholdGrams?: number;
}

export interface UpdateFilamentInput {
  brand?: string;
  materialType?: string;
  diameterMm?: number;
  colour?: string;
  costPerSpool?: number;
  costPerKg?: number;
  spoolWeightGrams?: number;
  remainingWeightGrams?: number;
  supplier?: string;
  purchaseDate?: string;
  notes?: string;
  lowStockThresholdGrams?: number;
}
```

Add a `filaments` key as a sibling of `printers`:

```typescript
    filaments: {
      findMany: () => prisma.filament.findMany({ where: { tenantId } }),

      findById: (id: string) => prisma.filament.findFirst({ where: { id, tenantId } }),

      create: (data: CreateFilamentInput) =>
        prisma.filament.create({
          data: {
            ...data,
            purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : undefined,
            tenantId,
          },
        }),

      update: (id: string, data: UpdateFilamentInput) =>
        prisma.filament.updateMany({
          where: { id, tenantId },
          data: {
            ...data,
            purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : undefined,
            tenantId: undefined,
          },
        }),
    },
```

- [ ] **Step 6: Create `src/routes/filaments.ts`**

```typescript
import { Router } from 'express';
import { z } from 'zod';
import { requireTenantAuth } from '../middleware/requireTenantAuth.js';
import { tenantScope } from '../db/scoped.js';

export const filamentsRouter = Router();
filamentsRouter.use(requireTenantAuth);

const createFilamentSchema = z.object({
  brand: z.string().min(1),
  materialType: z.string().min(1),
  diameterMm: z.union([z.literal(1.75), z.literal(2.85)]),
  colour: z.string().optional(),
  costPerSpool: z.number().optional(),
  costPerKg: z.number().optional(),
  spoolWeightGrams: z.number().optional(),
  remainingWeightGrams: z.number().optional(),
  supplier: z.string().optional(),
  purchaseDate: z.string().optional(),
  notes: z.string().optional(),
  lowStockThresholdGrams: z.number().optional(),
});

const updateFilamentSchema = createFilamentSchema.partial();

filamentsRouter.get('/api/filaments', async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const filaments = await scoped.filaments.findMany();
  res.json({ ok: true, filaments });
});

filamentsRouter.post('/api/filaments', async (req, res) => {
  const parsed = createFilamentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: 'Brand, material type, and a diameter of 1.75 or 2.85mm are required.' });
  }
  const scoped = tenantScope(req.tenantId!);
  const filament = await scoped.filaments.create(parsed.data);
  res.status(201).json({ ok: true, filament });
});

filamentsRouter.get('/api/filaments/:id', async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const filament = await scoped.filaments.findById(req.params.id);
  if (!filament) {
    return res.status(404).json({ ok: false, error: 'Filament not found.' });
  }
  res.json({ ok: true, filament });
});

filamentsRouter.patch('/api/filaments/:id', async (req, res) => {
  const parsed = updateFilamentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: 'Invalid filament fields.' });
  }
  const scoped = tenantScope(req.tenantId!);
  const result = await scoped.filaments.update(req.params.id, parsed.data);
  if (result.count === 0) {
    return res.status(404).json({ ok: false, error: 'Filament not found.' });
  }
  res.json({ ok: true });
});
```

- [ ] **Step 7: Wire the router into `src/app.ts`**

```typescript
import { filamentsRouter } from './routes/filaments.js';
```
```typescript
  app.use(filamentsRouter);
```

- [ ] **Step 8: Extend `resetTestDatabase()`**

Add `await prisma.filament.deleteMany();` anywhere before
`tenant.deleteMany()` (no FK relationship to printers, order among the
flat tables doesn't matter):

```typescript
export async function resetTestDatabase() {
  await prisma.printerMaintenanceLog.deleteMany();
  await prisma.printerPreset.deleteMany();
  await prisma.printer.deleteMany();
  await prisma.filament.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.session.deleteMany();
  await prisma.tenant.deleteMany();
  await prisma.platformAdmin.deleteMany();
}
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 10: Commit**

```bash
git add platform/api
git commit -m "Add Filament CRUD endpoints behind tenant auth"
```

---

## Task 5: Labour step CRUD

**Files:**
- Modify: `platform/api/prisma/schema.prisma`
- Modify: `platform/api/src/db/scoped.ts`
- Modify: `platform/api/src/app.ts`
- Modify: `platform/api/tests/helpers/testApp.ts`
- Create: `platform/api/src/routes/labour-steps.ts`
- Test: `platform/api/tests/labour-steps.test.ts`

**Interfaces:**
- Produces: `tenantScope(tenantId).labourSteps` with `{ findMany, findById, create, update }`. Produces `GET/POST /api/labour-steps`, `GET/PATCH /api/labour-steps/:id`.

- [ ] **Step 1: Add the `LabourStep` model — append to `prisma/schema.prisma`**

```prisma
model LabourStep {
  id          String   @id @default(uuid())
  tenantId    String
  name        String
  hourlyRate  Float
  active      Boolean  @default(true)
  createdAt   DateTime @default(now()) @db.Timestamptz(3)

  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@index([tenantId])
  @@map("labour_steps")
}
```

Add `labourSteps LabourStep[]` to the `Tenant` model.

- [ ] **Step 2: Run the migration**

Run:
```
npx prisma migrate dev --name add_labour_step
```

- [ ] **Step 3: Write the failing test — `tests/labour-steps.test.ts`**

```typescript
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildApp } from '../src/app.js';
import { resetTestDatabase } from './helpers/testApp.js';
import { prisma } from '../src/db/client.js';

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

test('labour step endpoints require auth', async () => {
  const app = buildApp();
  const res = await request(app).get('/api/labour-steps');
  assert.equal(res.status, 401);
});

test('POST /api/labour-steps rejects a missing hourly rate', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const res = await agent.post('/api/labour-steps').send({ name: 'Slicing & setup' });
  assert.equal(res.status, 400);
});

test('full create -> list -> update cycle, defaults active to true', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);

  const createRes = await agent.post('/api/labour-steps').send({
    name: 'Slicing & setup',
    hourlyRate: 150,
  });
  assert.equal(createRes.status, 201);
  assert.equal(createRes.body.labourStep.active, true);
  const id = createRes.body.labourStep.id;

  const listRes = await agent.get('/api/labour-steps');
  assert.equal(listRes.body.labourSteps.length, 1);

  const updateRes = await agent.patch(`/api/labour-steps/${id}`).send({ active: false });
  assert.equal(updateRes.status, 200);

  const getRes = await agent.get(`/api/labour-steps/${id}`);
  assert.equal(getRes.body.labourStep.active, false);
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test`
Expected: FAIL.

- [ ] **Step 5: Extend `src/db/scoped.ts`**

Add interfaces:

```typescript
export interface CreateLabourStepInput {
  name: string;
  hourlyRate: number;
  active?: boolean;
}

export interface UpdateLabourStepInput {
  name?: string;
  hourlyRate?: number;
  active?: boolean;
}
```

Add a `labourSteps` key:

```typescript
    labourSteps: {
      findMany: () => prisma.labourStep.findMany({ where: { tenantId } }),

      findById: (id: string) => prisma.labourStep.findFirst({ where: { id, tenantId } }),

      create: (data: CreateLabourStepInput) =>
        prisma.labourStep.create({ data: { ...data, tenantId } }),

      update: (id: string, data: UpdateLabourStepInput) =>
        prisma.labourStep.updateMany({ where: { id, tenantId }, data: { ...data, tenantId: undefined } }),
    },
```

- [ ] **Step 6: Create `src/routes/labour-steps.ts`**

```typescript
import { Router } from 'express';
import { z } from 'zod';
import { requireTenantAuth } from '../middleware/requireTenantAuth.js';
import { tenantScope } from '../db/scoped.js';

export const labourStepsRouter = Router();
labourStepsRouter.use(requireTenantAuth);

const createLabourStepSchema = z.object({
  name: z.string().min(1),
  hourlyRate: z.number(),
  active: z.boolean().optional(),
});

const updateLabourStepSchema = createLabourStepSchema.partial();

labourStepsRouter.get('/api/labour-steps', async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const labourSteps = await scoped.labourSteps.findMany();
  res.json({ ok: true, labourSteps });
});

labourStepsRouter.post('/api/labour-steps', async (req, res) => {
  const parsed = createLabourStepSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: 'Name and hourly rate are required.' });
  }
  const scoped = tenantScope(req.tenantId!);
  const labourStep = await scoped.labourSteps.create(parsed.data);
  res.status(201).json({ ok: true, labourStep });
});

labourStepsRouter.get('/api/labour-steps/:id', async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const labourStep = await scoped.labourSteps.findById(req.params.id);
  if (!labourStep) {
    return res.status(404).json({ ok: false, error: 'Labour step not found.' });
  }
  res.json({ ok: true, labourStep });
});

labourStepsRouter.patch('/api/labour-steps/:id', async (req, res) => {
  const parsed = updateLabourStepSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: 'Invalid labour step fields.' });
  }
  const scoped = tenantScope(req.tenantId!);
  const result = await scoped.labourSteps.update(req.params.id, parsed.data);
  if (result.count === 0) {
    return res.status(404).json({ ok: false, error: 'Labour step not found.' });
  }
  res.json({ ok: true });
});
```

- [ ] **Step 7: Wire the router into `src/app.ts`**

```typescript
import { labourStepsRouter } from './routes/labour-steps.js';
```
```typescript
  app.use(labourStepsRouter);
```

- [ ] **Step 8: Extend `resetTestDatabase()`**

Add `await prisma.labourStep.deleteMany();`:

```typescript
export async function resetTestDatabase() {
  await prisma.printerMaintenanceLog.deleteMany();
  await prisma.printerPreset.deleteMany();
  await prisma.printer.deleteMany();
  await prisma.filament.deleteMany();
  await prisma.labourStep.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.session.deleteMany();
  await prisma.tenant.deleteMany();
  await prisma.platformAdmin.deleteMany();
}
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 10: Commit**

```bash
git add platform/api
git commit -m "Add Labour Step CRUD endpoints behind tenant auth"
```

---

## Task 6: Consumable CRUD

**Files:**
- Modify: `platform/api/prisma/schema.prisma`
- Modify: `platform/api/src/db/scoped.ts`
- Modify: `platform/api/src/app.ts`
- Modify: `platform/api/tests/helpers/testApp.ts`
- Create: `platform/api/src/routes/consumables.ts`
- Test: `platform/api/tests/consumables.test.ts`

**Interfaces:**
- Produces: `tenantScope(tenantId).consumables` with `{ findMany, findById, create, update }`. Produces `GET/POST /api/consumables`, `GET/PATCH /api/consumables/:id`.

- [ ] **Step 1: Add the `Consumable` model — append to `prisma/schema.prisma`**

```prisma
model Consumable {
  id                String   @id @default(uuid())
  tenantId          String
  name              String
  category          String
  unitOfMeasure     String
  costPerUnit       Float
  currentStock      Float    @default(0)
  reorderThreshold  Float?
  supplier          String?
  createdAt         DateTime @default(now()) @db.Timestamptz(3)

  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@index([tenantId])
  @@map("consumables")
}
```

Add `consumables Consumable[]` to the `Tenant` model.

- [ ] **Step 2: Run the migration**

Run:
```
npx prisma migrate dev --name add_consumable
```

- [ ] **Step 3: Write the failing test — `tests/consumables.test.ts`**

```typescript
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildApp } from '../src/app.js';
import { resetTestDatabase } from './helpers/testApp.js';
import { prisma } from '../src/db/client.js';

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

test('consumable endpoints require auth', async () => {
  const app = buildApp();
  const res = await request(app).get('/api/consumables');
  assert.equal(res.status, 401);
});

test('POST /api/consumables rejects an invalid category', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const res = await agent.post('/api/consumables').send({
    name: 'Isopropyl alcohol',
    category: 'not-a-real-category',
    unitOfMeasure: 'ml',
    costPerUnit: 0.5,
  });
  assert.equal(res.status, 400);
});

test('full create -> list -> update cycle', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);

  const createRes = await agent.post('/api/consumables').send({
    name: 'Build plate adhesive',
    category: 'build-plate-adhesive',
    unitOfMeasure: 'each',
    costPerUnit: 45,
    currentStock: 10,
    reorderThreshold: 2,
  });
  assert.equal(createRes.status, 201);
  const id = createRes.body.consumable.id;

  const listRes = await agent.get('/api/consumables');
  assert.equal(listRes.body.consumables.length, 1);

  const updateRes = await agent.patch(`/api/consumables/${id}`).send({ currentStock: 8 });
  assert.equal(updateRes.status, 200);

  const getRes = await agent.get(`/api/consumables/${id}`);
  assert.equal(getRes.body.consumable.currentStock, 8);
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test`
Expected: FAIL.

- [ ] **Step 5: Extend `src/db/scoped.ts`**

Add interfaces:

```typescript
export interface CreateConsumableInput {
  name: string;
  category: string;
  unitOfMeasure: string;
  costPerUnit: number;
  currentStock?: number;
  reorderThreshold?: number;
  supplier?: string;
}

export interface UpdateConsumableInput {
  name?: string;
  category?: string;
  unitOfMeasure?: string;
  costPerUnit?: number;
  currentStock?: number;
  reorderThreshold?: number;
  supplier?: string;
}
```

Add a `consumables` key:

```typescript
    consumables: {
      findMany: () => prisma.consumable.findMany({ where: { tenantId } }),

      findById: (id: string) => prisma.consumable.findFirst({ where: { id, tenantId } }),

      create: (data: CreateConsumableInput) =>
        prisma.consumable.create({ data: { ...data, tenantId } }),

      update: (id: string, data: UpdateConsumableInput) =>
        prisma.consumable.updateMany({ where: { id, tenantId }, data: { ...data, tenantId: undefined } }),
    },
```

- [ ] **Step 6: Create `src/routes/consumables.ts`**

```typescript
import { Router } from 'express';
import { z } from 'zod';
import { requireTenantAuth } from '../middleware/requireTenantAuth.js';
import { tenantScope } from '../db/scoped.js';

export const consumablesRouter = Router();
consumablesRouter.use(requireTenantAuth);

const CATEGORIES = ['resin', 'nozzle', 'build-plate-adhesive', 'post-processing', 'packaging', 'other'] as const;

const createConsumableSchema = z.object({
  name: z.string().min(1),
  category: z.enum(CATEGORIES),
  unitOfMeasure: z.string().min(1),
  costPerUnit: z.number(),
  currentStock: z.number().optional(),
  reorderThreshold: z.number().optional(),
  supplier: z.string().optional(),
});

const updateConsumableSchema = createConsumableSchema.partial();

consumablesRouter.get('/api/consumables', async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const consumables = await scoped.consumables.findMany();
  res.json({ ok: true, consumables });
});

consumablesRouter.post('/api/consumables', async (req, res) => {
  const parsed = createConsumableSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: 'Name, a valid category, unit of measure, and cost per unit are required.' });
  }
  const scoped = tenantScope(req.tenantId!);
  const consumable = await scoped.consumables.create(parsed.data);
  res.status(201).json({ ok: true, consumable });
});

consumablesRouter.get('/api/consumables/:id', async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const consumable = await scoped.consumables.findById(req.params.id);
  if (!consumable) {
    return res.status(404).json({ ok: false, error: 'Consumable not found.' });
  }
  res.json({ ok: true, consumable });
});

consumablesRouter.patch('/api/consumables/:id', async (req, res) => {
  const parsed = updateConsumableSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: 'Invalid consumable fields.' });
  }
  const scoped = tenantScope(req.tenantId!);
  const result = await scoped.consumables.update(req.params.id, parsed.data);
  if (result.count === 0) {
    return res.status(404).json({ ok: false, error: 'Consumable not found.' });
  }
  res.json({ ok: true });
});
```

- [ ] **Step 7: Wire the router into `src/app.ts`**

```typescript
import { consumablesRouter } from './routes/consumables.js';
```
```typescript
  app.use(consumablesRouter);
```

- [ ] **Step 8: Extend `resetTestDatabase()`** (final form)

```typescript
import { prisma } from '../../src/db/client.js';

export async function resetTestDatabase() {
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

- [ ] **Step 9: Run tests to verify they pass**

Run: `npm test`
Expected: all tests pass (Foundation's 23 + this plan's new tests across 6
files).

- [ ] **Step 10: Run typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 11: Commit**

```bash
git add platform/api
git commit -m "Add Consumable CRUD endpoints behind tenant auth"
```

---

## Self-Review Notes

- **Spec coverage:** SRS §4.6 (printers, presets, maintenance log) — Tasks
  1–3. SRS §4.7 (labour steps & rates) — Task 5. SRS §4.8 (consumables) —
  Task 6. SRS §4.9 (filament) — Task 4. Nested-resource tenant scoping risk
  (flagged in the design spec) — every preset/maintenance-log route calls
  `requireOwnedPrinter` before touching child rows, and every child table
  carries its own `tenantId` for defense in depth, not just a join through
  `printerId`. Not covered by this plan (intentionally, per the spec):
  filament price history, low-stock notifications, the costing engine,
  any frontend.
- **Placeholder scan:** no TBD/TODO markers; every step has complete code.
- **Type consistency:** `tenantScope(tenantId)` keeps returning one object
  with all resource groups as sibling keys — `printers`, `printerPresets`,
  `printerMaintenanceLogs`, `filaments`, `labourSteps`, `consumables` —
  matching the shape Foundation's `customers` key established. Every
  `update()` method strips `tenantId` (and, for nested resources,
  `printerId`) from `data` before the Prisma call, matching Foundation's
  Task 6 fix from the start. Every `DateTime` field carries
  `@db.Timestamptz(3)`, matching Foundation's Task 2 fix from the start.
  Response body keys (`printer`/`printers`, `preset`/`presets`,
  `entry`/`entries`, `filament`/`filaments`, `labourStep`/`labourSteps`,
  `consumable`/`consumables`) are consistent singular/plural pairs per
  resource, matching the `customer`/`customers` convention. Test helper
  functions authenticate via the real register/verify/login HTTP flow in
  every task, matching Foundation's proven pattern — no test depends on
  hand-constructing a session cookie or touching supertest/superagent
  internals beyond what's already used in the codebase.

---

Plan complete and saved to `docs/superpowers/plans/2026-09-07-reference-data-modules.md`.
