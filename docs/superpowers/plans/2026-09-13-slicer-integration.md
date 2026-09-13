# Slicer Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add server-side STL slicing (weight/support-weight/filament-length/print-time) backed by a single-worker queue running PrusaSlicer's CLI, surfaced through a standalone Slicer tool and wired into Costing Templates, Job Cards, and Quotes.

**Architecture:** One shared `SliceJob` model + in-process worker queue in `platform/api`, exposed via two routes (`POST /api/slicer/jobs`, `GET /api/slicer/jobs/:id`). One shared `<SliceUploadPanel>` frontend component reused across four call sites, each wiring the panel's result differently.

**Tech Stack:** Same as the rest of the repo — Express 5/TS/Prisma/zod on the backend, React 18/Vite/TS/Tailwind/react-query on the frontend. New dependencies: `multer` (backend, multipart upload). PrusaSlicer's console-only Linux CLI build is a system dependency installed on the VPS at deploy time, not an npm package.

Full design context: [docs/superpowers/specs/2026-09-13-slicer-integration-design.md](../specs/2026-09-13-slicer-integration-design.md) — read it before starting either task below; this plan does not repeat the "why," only the "what to build."

## Global Constraints

- `SLICER_MAX_CONCURRENCY` (default `1`), `SLICER_TIMEOUT_SECONDS` (default `90`), `SLICER_SCRATCH_DIR` are new env vars, added to `src/env.ts` following the exact optional-with-default pattern already used there (e.g. `port`, `sessionCookieName`) — never `required()`.
- STL upload cap: 20MB, `.stl` extension only.
- STL sanity check (triangle count, well-formed binary/ASCII detection) happens server-side BEFORE a `SliceJob` row is even created, reusing the parsing rules already written in `landing/public/js/stl-scaler-core.js` (`parseBinarySTL`, `isAsciiStl`, `computeBoundingBox`) — port the logic, do not reinvent it.
- The worker never runs two slices concurrently by default (`SLICER_MAX_CONCURRENCY=1`) — a global FIFO queue across all tenants, not per-tenant.
- Every route in this feature is gated by `requireTenantAuth` + `requireActiveSubscription`, applied per-route (never a blanket `router.use(...)`) — see `consumables.ts`'s comment on backlog #6 for why.
- All new Prisma fields/models follow the existing tenant-scoping convention: every table with tenant data gets a `tenantId` column + `@@index([tenantId])`, and every accessor goes through `tenantScope()` in `src/db/scoped.ts`, matching the exact style already used there (see the "three-state pattern" comments throughout that file for how optional-field updates distinguish "omit" vs "explicit null").
- No new frontend library — the polling UI uses `@tanstack/react-query`'s `refetchInterval`, exactly as already used everywhere else in `platform/frontend`.

---

### Task 1: Backend slicing service (schema, STL validation, G-code parsing, queue worker, API routes)

**Files:**
- Modify: `platform/api/prisma/schema.prisma`
- Create: `platform/api/prisma/migrations/<timestamp>_add_slicer/migration.sql` (via `npx prisma migrate dev`)
- Modify: `platform/api/src/db/scoped.ts`
- Modify: `platform/api/src/env.ts`
- Create: `platform/api/src/slicer/stlValidator.ts`
- Create: `platform/api/src/slicer/gcodeParser.ts`
- Create: `platform/api/src/slicer/profileBuilder.ts`
- Create: `platform/api/src/slicer/worker.ts`
- Create: `platform/api/src/routes/slicer.ts`
- Modify: `platform/api/src/app.ts`
- Modify: `platform/api/src/server.ts` (start the worker loop alongside the existing notification-checks scheduler)
- Modify: `platform/api/tests/helpers/testApp.ts` (add new tables to `resetTestDatabase`, in FK-safe order)
- Create: `platform/api/tests/slicer-stlValidator.test.ts`
- Create: `platform/api/tests/slicer-gcodeParser.test.ts`
- Create: `platform/api/tests/slicer-worker.test.ts`
- Create: `platform/api/tests/slicer.test.ts`
- Create: `platform/api/tests/fixtures/slicer-stub-binary.sh` (fake `prusa-slicer-console` used by tests)
- Modify: `platform/api/package.json` (add `multer`, `@types/multer`)

**Interfaces:**
- Produces: `SliceJob` Prisma model with fields `id, tenantId, status ('queued'|'processing'|'done'|'failed'), originFileName, printerId?, printerPresetId?, filamentId?, resultWeightGrams?, resultSupportWeightGrams?, resultFilamentLengthMm?, resultPrintTimeHours?, errorMessage?, createdAt, completedAt?`.
- Produces: `tenantScope(tenantId).sliceJobs` with `create(data)`, `findById(id)`, `findOldestQueued()` (global, not tenant-scoped — used only by the worker, documented inline same as `featureRequests.findAll`'s non-scoping comment), `markProcessing(id)`, `markDone(id, result)`, `markFailed(id, errorMessage)`, `sweepStaleProcessing(olderThanMs)`.
- Produces: `POST /api/slicer/jobs` → `{ ok: true, job: { id, status } }` (202-style synchronous response, job not yet processed). `GET /api/slicer/jobs/:id` → `{ ok: true, job: SliceJob }`.
- Produces (pure functions, importable by Task 2's frontend work has no direct dependency on these — they're backend-internal, but Task 2's reviewer should know they exist): `validateStlBuffer(buffer: Buffer): { triangleCount: number, boundingBoxMm: {x,y,z} }` (throws with a user-facing message on any invalid input), `parseGcodeFooter(gcodeText: string): { weightGrams: number, supportWeightGrams: number, filamentLengthMm: number, printTimeHours: number } | null` (null, not throw, on unparsable footer), `buildSlicerProfile(input: { printerPreset?: PrinterPreset, filament?: Filament, nozzleDiameterMm: number }): string` (returns PrusaSlicer `.ini` config text).
- Consumes: existing `requireTenantAuth`, `requireActiveSubscription` middleware (`src/middleware/`), existing `tenantScope` pattern, existing `Printer`/`PrinterPreset`/`Filament` models (read-only lookups, no changes to those routes).

- [ ] **Step 1: Add schema changes**

Add to `platform/api/prisma/schema.prisma`, in the same style as neighboring models (`Scanner`, `LaserMaterial`):

```prisma
model SliceJob {
  id                       String    @id @default(uuid())
  tenantId                 String
  status                   String    @default("queued") // queued | processing | done | failed
  originFileName           String
  printerId                String?
  printerPresetId          String?
  filamentId               String?
  resultWeightGrams        Float?
  resultSupportWeightGrams Float?
  resultFilamentLengthMm   Float?
  resultPrintTimeHours     Float?
  errorMessage             String?
  createdAt                DateTime  @default(now()) @db.Timestamptz(3)
  completedAt              DateTime? @db.Timestamptz(3)

  tenant        Tenant         @relation(fields: [tenantId], references: [id])
  printer       Printer?       @relation(fields: [printerId], references: [id], onDelete: SetNull)
  printerPreset PrinterPreset? @relation(fields: [printerPresetId], references: [id], onDelete: SetNull)
  filament      Filament?      @relation(fields: [filamentId], references: [id], onDelete: SetNull)

  @@index([tenantId])
  @@index([status])
  @@map("slice_jobs")
}
```

Add `nozzleDiameterMm Float?` to `Printer` (next to the existing `powerDrawWatts` field).

Add to `JobCard`'s "Print fields" section (next to `printFileName`):
```prisma
  sliceJobId               String?
  stlFileName              String?
  sliceWeightGrams         Float?
  sliceSupportWeightGrams  Float?
  sliceFilamentLengthMm    Float?
  slicePrintTimeHours      Float?
```

Add `sliceJobId String?` to `CostingTemplate` (next to `printerId`), with a corresponding `sliceJob SliceJob? @relation(fields: [sliceJobId], references: [id], onDelete: SetNull)`.

Add matching back-relations: `Tenant` gets `sliceJobs SliceJob[]`; `Printer` gets `sliceJobs SliceJob[]`; `PrinterPreset` gets `sliceJobs SliceJob[]`; `Filament` gets `sliceJobs SliceJob[]`.

- [ ] **Step 2: Generate and apply migration**

Run: `npx prisma migrate dev --name add_slicer`
Expected: migration file created under `prisma/migrations/`, applied to `barkie_dev` cleanly (this schema is purely additive — new model, new nullable columns — so no data-loss warnings should appear; if Prisma prompts about anything unexpected, stop and report rather than force it through).

- [ ] **Step 3: Add env vars**

In `platform/api/src/env.ts`, add to the exported `env` object (after `trustProxy`, following the existing optional-with-default style):
```ts
  slicerMaxConcurrency: Number(process.env.SLICER_MAX_CONCURRENCY ?? 1),
  slicerTimeoutSeconds: Number(process.env.SLICER_TIMEOUT_SECONDS ?? 90),
  slicerScratchDir: process.env.SLICER_SCRATCH_DIR ?? './slicer-scratch',
```

- [ ] **Step 4: Write the STL validator (port, not reinvent)**

Create `platform/api/src/slicer/stlValidator.ts`. Port `isAsciiStl`, `parseBinarySTL`, and `computeBoundingBox` from `landing/public/js/stl-scaler-core.js` verbatim (same byte-layout logic, same constants), adapted to operate on Node `Buffer`/`ArrayBuffer` and typed in TS instead of JSDoc. Add a new wrapping function:

```ts
export interface StlValidationResult {
  triangleCount: number;
  boundingBoxMm: { x: number; y: number; z: number };
}

const MAX_TRIANGLE_COUNT = 2_000_000;

export function validateStlBuffer(buffer: Buffer): StlValidationResult {
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  // parseBinarySTL throws a user-facing Error message for: too-small buffer,
  // ASCII STL (unsupported), and truncated/corrupt binary STL — all three
  // propagate as-is to the route, which reports them as 400s.
  const parsed = parseBinarySTL(arrayBuffer);
  if (parsed.triangleCount > MAX_TRIANGLE_COUNT) {
    throw new Error(`Model is too complex to slice (${parsed.triangleCount.toLocaleString()} triangles, limit ${MAX_TRIANGLE_COUNT.toLocaleString()}).`);
  }
  const box = computeBoundingBox(parsed.vertices);
  return { triangleCount: parsed.triangleCount, boundingBoxMm: box.size };
}
```

- [ ] **Step 5: Test the STL validator**

Create `platform/api/tests/slicer-stlValidator.test.ts`. Build tiny binary STL buffers by hand (a single-triangle cube face is enough — reuse the byte-layout constants) for: a valid minimal binary STL (passes, `triangleCount: 1`), a truncated buffer (throws "truncated"), a text buffer starting with `"solid "` whose declared count doesn't match its length (throws the ASCII-unsupported message), and a valid binary STL whose header falsely claims `2_000_001` triangles with buffer bytes actually present for that many (throws the "too complex" message — construct this by padding the buffer to the expected size with zero bytes rather than real geometry, since only the count and buffer length are checked).
Run: `npm test -- slicer-stlValidator` (or the project's equivalent single-file test invocation)
Expected: all new tests pass.

- [ ] **Step 6: Write the G-code footer parser**

Create `platform/api/src/slicer/gcodeParser.ts`:
```ts
export interface GcodeSliceResult {
  weightGrams: number;
  supportWeightGrams: number;
  filamentLengthMm: number;
  printTimeHours: number;
}

// PrusaSlicer writes lines like:
//   ; filament used [g] = 12.34, 1.20
//   ; filament used [mm] = 456.70, 12.30
//   ; estimated printing time (normal mode) = 1h 23m 45s
// The first value in a comma-separated "filament used" line is the model
// filament; a second value (if present) is support filament on a different
// extruder/tool. Time is normalized to fractional hours.
export function parseGcodeFooter(gcodeText: string): GcodeSliceResult | null {
  const weightMatch = gcodeText.match(/;\s*filament used \[g\]\s*=\s*([\d.]+)(?:\s*,\s*([\d.]+))?/);
  const lengthMatch = gcodeText.match(/;\s*filament used \[mm\]\s*=\s*([\d.]+)/);
  const timeMatch = gcodeText.match(/;\s*estimated printing time.*=\s*(.+)/);
  if (!weightMatch || !lengthMatch || !timeMatch) {
    return null;
  }
  const printTimeHours = parseDurationToHours(timeMatch[1].trim());
  if (printTimeHours === null) {
    return null;
  }
  return {
    weightGrams: Number(weightMatch[1]),
    supportWeightGrams: weightMatch[2] ? Number(weightMatch[2]) : 0,
    filamentLengthMm: Number(lengthMatch[1]),
    printTimeHours,
  };
}

// Parses PrusaSlicer's "1d 2h 3m 4s" style duration (any subset of the four
// units, in that order) into fractional hours. Returns null rather than
// throwing on an unrecognized format, so the caller can treat it the same
// as a missing footer.
function parseDurationToHours(text: string): number | null {
  const match = text.match(/^(?:(\d+)d\s*)?(?:(\d+)h\s*)?(?:(\d+)m\s*)?(?:(\d+)s\s*)?$/);
  if (!match || !match[0].trim()) {
    return null;
  }
  const [, days, hours, minutes, seconds] = match;
  const totalHours =
    Number(days ?? 0) * 24 +
    Number(hours ?? 0) +
    Number(minutes ?? 0) / 60 +
    Number(seconds ?? 0) / 3600;
  return totalHours;
}
```

- [ ] **Step 7: Test the G-code footer parser**

Create `platform/api/tests/slicer-gcodeParser.test.ts`. Cases: a full well-formed footer with both model+support weight (correct values extracted), a footer with only model weight (no comma) — `supportWeightGrams` is `0`, a footer missing the time line entirely (`null`), a footer with `"1h 23m 45s"` (verify the hour math: `1 + 23/60 + 45/3600`), a footer with only `"45s"` (verify `45/3600`), and a completely unrelated text blob (`null`).
Run: `npm test -- slicer-gcodeParser`
Expected: all pass.

- [ ] **Step 8: Write the slicer profile builder**

Create `platform/api/src/slicer/profileBuilder.ts`. Per-material default temp/speed fallbacks (used when no `PrinterPreset` is linked):
```ts
const MATERIAL_DEFAULTS: Record<string, { nozzleTempC: number; bedTempC: number; printSpeedMmS: number }> = {
  PLA:  { nozzleTempC: 200, bedTempC: 60, printSpeedMmS: 60 },
  PETG: { nozzleTempC: 235, bedTempC: 80, printSpeedMmS: 50 },
  ABS:  { nozzleTempC: 245, bedTempC: 100, printSpeedMmS: 50 },
};
const FALLBACK_MATERIAL_DEFAULTS = MATERIAL_DEFAULTS.PLA;
const DEFAULT_LAYER_HEIGHT_MM = 0.2;
const DEFAULT_INFILL_PERCENT = 15;
const DEFAULT_NOZZLE_DIAMETER_MM = 0.4;

export interface ProfileBuilderInput {
  printerPreset?: { layerHeightMm: number | null; infillPercent: number | null; nozzleTempC: number | null; bedTempC: number | null; printSpeedMmS: number | null } | null;
  filamentMaterialType?: string | null;
  nozzleDiameterMm?: number | null;
}

export function buildSlicerProfile(input: ProfileBuilderInput): string {
  const materialDefaults = MATERIAL_DEFAULTS[(input.filamentMaterialType ?? '').toUpperCase()] ?? FALLBACK_MATERIAL_DEFAULTS;
  const preset = input.printerPreset;
  const layerHeightMm = preset?.layerHeightMm ?? DEFAULT_LAYER_HEIGHT_MM;
  const infillPercent = preset?.infillPercent ?? DEFAULT_INFILL_PERCENT;
  const nozzleTempC = preset?.nozzleTempC ?? materialDefaults.nozzleTempC;
  const bedTempC = preset?.bedTempC ?? materialDefaults.bedTempC;
  const printSpeedMmS = preset?.printSpeedMmS ?? materialDefaults.printSpeedMmS;
  const nozzleDiameterMm = input.nozzleDiameterMm ?? DEFAULT_NOZZLE_DIAMETER_MM;

  return [
    '[print]',
    `layer_height = ${layerHeightMm}`,
    `fill_density = ${infillPercent}%`,
    'support_material = 1',
    `perimeter_speed = ${printSpeedMmS}`,
    '',
    '[filament]',
    `temperature = ${nozzleTempC}`,
    `bed_temperature = ${bedTempC}`,
    '',
    '[printer]',
    `nozzle_diameter = ${nozzleDiameterMm}`,
    '',
  ].join('\n');
}
```

- [ ] **Step 9: Test the profile builder**

Create a `slicer-profileBuilder.test.ts` alongside the other two new test files (grouped into `slicer-worker.test.ts` is also acceptable if you prefer fewer files — pick one and be consistent). Cases: no preset + `PLA` material → PLA defaults used; no preset + unrecognized material string → falls back to PLA defaults; preset present with all fields set → preset values used verbatim, material defaults ignored; preset present but with `layerHeightMm: null` (preset exists but that one field wasn't set) → falls back to the layer-height default while still using the preset's other set fields.
Run: `npm test -- profileBuilder` (or whatever filename you chose)
Expected: all pass.

- [ ] **Step 10: Write the queue worker**

Create `platform/api/src/slicer/worker.ts`. The worker resolves the slicer binary path via an env var (`SLICER_BINARY_PATH`, defaulting to `prusa-slicer-console`, so tests can point it at the stub script from Step 12) and wraps the spawn in `systemd-run` when available, falling back to a plain spawn + timeout otherwise:

```ts
import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../env.js';
import { tenantScope } from '../db/scoped.js';
import { validateStlBuffer } from './stlValidator.js';
import { buildSlicerProfile } from './profileBuilder.js';
import { parseGcodeFooter } from './gcodeParser.js';

const SLICER_BINARY_PATH = process.env.SLICER_BINARY_PATH ?? 'prusa-slicer-console';
// Set only in tests, to skip the systemd-run wrapper that isn't available
// in CI/dev containers — production always uses systemd-run.
const USE_SYSTEMD_SCOPE = process.env.SLICER_USE_SYSTEMD !== 'false';

function spawnSlicer(args: string[]) {
  if (USE_SYSTEMD_SCOPE) {
    return spawn('systemd-run', [
      '--scope', '-p', 'MemoryMax=400M', '-p', 'CPUQuota=85%', '--',
      SLICER_BINARY_PATH, ...args,
    ]);
  }
  return spawn(SLICER_BINARY_PATH, args);
}

async function runOneJob(job: { id: string; tenantId: string; printerId: string | null; printerPresetId: string | null; filamentId: string | null; stlBuffer: Buffer }) {
  const scoped = tenantScope(job.tenantId);
  await scoped.sliceJobs.markProcessing(job.id);

  const jobDir = path.join(env.slicerScratchDir, job.id);
  await mkdir(jobDir, { recursive: true });
  const stlPath = path.join(jobDir, 'model.stl');
  const profilePath = path.join(jobDir, 'profile.ini');
  const gcodePath = path.join(jobDir, 'out.gcode');

  try {
    validateStlBuffer(job.stlBuffer); // already validated at upload time; re-checked here defensively before the (expensive) child process runs
    await writeFile(stlPath, job.stlBuffer);

    const printer = job.printerId ? await scoped.printers.findById(job.printerId) : null;
    const preset = job.printerPresetId ? await scoped.printerPresets.findById(job.printerId!, job.printerPresetId) : null;
    const filament = job.filamentId ? await scoped.filaments.findById(job.filamentId) : null;
    await writeFile(profilePath, buildSlicerProfile({
      printerPreset: preset,
      filamentMaterialType: filament?.materialType ?? null,
      nozzleDiameterMm: printer?.nozzleDiameterMm ?? null,
    }));

    const exitCode = await new Promise<number>((resolve, reject) => {
      const child = spawnSlicer(['--load', profilePath, stlPath, '-g', '-o', gcodePath]);
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error('slicing timed out'));
      }, env.slicerTimeoutSeconds * 1000);
      child.on('error', (err) => { clearTimeout(timer); reject(err); });
      child.on('exit', (code) => { clearTimeout(timer); resolve(code ?? 1); });
    });
    if (exitCode !== 0) {
      throw new Error('slicing failed');
    }

    const gcodeText = await readFile(gcodePath, 'utf-8');
    const result = parseGcodeFooter(gcodeText);
    if (!result) {
      throw new Error('invalid or corrupt STL');
    }
    await scoped.sliceJobs.markDone(job.id, {
      resultWeightGrams: result.weightGrams,
      resultSupportWeightGrams: result.supportWeightGrams,
      resultFilamentLengthMm: result.filamentLengthMm,
      resultPrintTimeHours: result.printTimeHours,
    });
  } catch (error) {
    await scoped.sliceJobs.markFailed(job.id, error instanceof Error ? error.message : 'slicing failed');
  } finally {
    await rm(jobDir, { recursive: true, force: true });
  }
}

let workerLoopHandle: ReturnType<typeof setInterval> | null = null;

export function startSlicerWorker() {
  if (workerLoopHandle) return; // idempotent — startServer() calling this twice (e.g. in a test) is a no-op, not a double loop
  workerLoopHandle = setInterval(async () => {
    await sweepStaleJobs();
    // NOTE: SLICER_MAX_CONCURRENCY > 1 support is intentionally not built here —
    // see the design spec's config-not-hardcoded rationale. Raising the env var
    // beyond 1 today does nothing until a future task adds a concurrent-slot
    // pool; document this limitation in the env var's own comment in env.ts.
    const next = await findOldestQueuedJobAcrossAllTenants();
    if (next) await runOneJob(next);
  }, 2000);
}

export function stopSlicerWorker() {
  if (workerLoopHandle) clearInterval(workerLoopHandle);
  workerLoopHandle = null;
}

async function sweepStaleJobs() {
  const staleMs = env.slicerTimeoutSeconds * 1000 * 2; // generous margin over the hard per-job timeout
  await sweepAllTenantsStaleProcessing(staleMs); // see Step 11 — a cross-tenant DB call, implemented in scoped.ts as a standalone export, not inside tenantScope(), same reasoning as tenantScope's own non-scoped featureRequests.findAll
}
```

Note: `findOldestQueuedJobAcrossAllTenants` and `sweepAllTenantsStaleProcessing` are cross-tenant queries (the worker has no single tenant context) — implement them as standalone exported functions in `src/db/scoped.ts` (not inside the `tenantScope(tenantId)` closure, since they take no `tenantId`), clearly commented as intentionally global, same precedent as `featureRequests.findAll`'s documented non-scoping.

- [ ] **Step 11: Add `sliceJobs` to `tenantScope()` and the two standalone cross-tenant helpers**

In `platform/api/src/db/scoped.ts`, add a `sliceJobs` entry to the object returned by `tenantScope()` (tenant-scoped: `create`, `findById`, `markProcessing`, `markDone`, `markFailed` — each following the exact `updateMany` + re-`findFirst` pattern already used for `jobCards.update` etc.), plus two new **standalone exported functions** (outside `tenantScope()`, same placement as `nextSequenceValue`) for the worker's global queries: `findOldestQueuedSliceJobAcrossAllTenants()` and `sweepStaleProcessingSliceJobs(olderThanMs: number)`.

- [ ] **Step 12: Write a stub slicer binary for tests**

Create `platform/api/tests/fixtures/slicer-stub-binary.sh` (or a `.js` run via `node`, whichever is simpler to make executable cross-platform in this repo's existing CI) that ignores its arguments and writes a canned G-code file (matching the `-o <path>` argument) containing a valid footer, exiting 0. Add a second stub or an env-toggle for a "failing" run (exit 1, or a run that hangs past the timeout) so timeout/failure paths can be tested without a real slicer.

- [ ] **Step 13: Write the API routes**

Create `platform/api/src/routes/slicer.ts`, following `consumables.ts`'s exact structure (per-route auth gating, zod validation, `tenantScope`). Use `multer` with `memoryStorage()` (no need to hit disk until the worker actually processes the job), `limits: { fileSize: 20 * 1024 * 1024 }`, and a `fileFilter` rejecting anything not ending in `.stl`. On upload: run `validateStlBuffer` synchronously in the route handler (before creating the `SliceJob` row) so a garbage upload gets an immediate 400, never even entering the queue.

```ts
import { Router } from 'express';
import multer from 'multer';
import { requireTenantAuth } from '../middleware/requireTenantAuth.js';
import { requireActiveSubscription } from '../middleware/requireActiveSubscription.js';
import { tenantScope } from '../db/scoped.js';
import { validateStlBuffer } from '../slicer/stlValidator.js';

export const slicerRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, file.originalname.toLowerCase().endsWith('.stl'));
  },
});

slicerRouter.post('/api/slicer/jobs', requireTenantAuth, requireActiveSubscription, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ ok: false, error: 'A .stl file is required.' });
  }
  try {
    validateStlBuffer(req.file.buffer);
  } catch (error) {
    return res.status(400).json({ ok: false, error: error instanceof Error ? error.message : 'Invalid STL file.' });
  }
  const scoped = tenantScope(req.tenantId!);
  const job = await scoped.sliceJobs.create({
    originFileName: req.file.originalname,
    printerId: req.body.printerId || null,
    printerPresetId: req.body.printerPresetId || null,
    filamentId: req.body.filamentId || null,
    stlBuffer: req.file.buffer, // held only in the in-process queue entry, not persisted to the SliceJob row itself — see worker.ts
  });
  res.status(201).json({ ok: true, job: { id: job.id, status: job.status } });
});

slicerRouter.get('/api/slicer/jobs/:id', requireTenantAuth, requireActiveSubscription, async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const job = await scoped.sliceJobs.findById(req.params.id);
  if (!job) {
    return res.status(404).json({ ok: false, error: 'Slice job not found.' });
  }
  res.json({ ok: true, job });
});
```

Note the STL bytes are NOT a `SliceJob` column (the Prisma model in Step 1 has no such field) — the route must hand the buffer to the worker's in-memory queue directly (e.g. a small in-process `Map<jobId, Buffer>` populated on creation and read/deleted by `runOneJob`), not round-trip it through Postgres. Document this clearly in `worker.ts` and `slicer.ts` with a comment explaining why (large binary blobs don't belong in the relational row, and the file only needs to exist for the few seconds between upload and slice).

- [ ] **Step 14: Wire into `app.ts` and `server.ts`**

Add `import { slicerRouter } from './routes/slicer.js';` and `app.use(slicerRouter);` to `platform/api/src/app.ts`, grouped with the other per-tenant resource routers (after `teamRouter`, before the 404 handler).

Find `platform/api/src/server.ts` (or wherever the notification-checks scheduler is currently started) and add `startSlicerWorker()` alongside it.

- [ ] **Step 15: Update `resetTestDatabase`**

In `platform/api/tests/helpers/testApp.ts`, add `await prisma.sliceJob.deleteMany();` in FK-safe order — before `printer`/`filament`/`tenant` deletion (since `SliceJob` references all three), same placement logic as the existing comments there (e.g. `jobCard` deleted before `quote`/`customer`/`tenant`).

- [ ] **Step 16: Write route + queue integration tests**

Create `platform/api/tests/slicer.test.ts`. Point `SLICER_BINARY_PATH` and `SLICER_USE_SYSTEMD=false` at the Step 12 stub via `process.env` in a `before`/`beforeEach` hook (or via `.env.test`, whichever this repo's existing test env-var convention uses — check how `mailer.isConfigured()`'s tests toggle SMTP env vars for the established pattern). Cover:
- unauthenticated request → 401 (via `buildMinimalApp(slicerRouter)`, same as `scanners.test.ts`'s auth test).
- upload with no file → 400.
- upload with a non-`.stl` filename → 400 (multer's `fileFilter` rejection surfaces as `req.file` being undefined).
- upload with a corrupt/truncated STL → 400 with the validator's message.
- full cycle: upload a small valid binary STL fixture → `201` with `status: 'queued'` → poll `GET /api/slicer/jobs/:id` until `status: 'done'` (test can call `runOneJob`/await the worker loop directly instead of real polling, to keep the test fast and deterministic) → result fields match the stub's canned footer values.
- a run against the "failing" stub variant from Step 12 → job ends `status: 'failed'` with a non-empty `errorMessage`.
- tenant isolation: tenant A cannot `GET` tenant B's slice job (mirrors `scanners.test.ts`'s tenant-isolation test).

Run: `npm test`
Expected: all new tests pass, and the full existing suite still passes (no regressions from the `resetTestDatabase`/schema changes).

- [ ] **Step 17: Typecheck, lint, commit**

Run: `npm run typecheck && npm run lint`
Expected: both clean.

```bash
git add platform/api/prisma/schema.prisma platform/api/prisma/migrations platform/api/src/db/scoped.ts platform/api/src/env.ts platform/api/src/slicer platform/api/src/routes/slicer.ts platform/api/src/app.ts platform/api/src/server.ts platform/api/tests platform/api/package.json platform/api/package-lock.json
git commit -m "Add backend slicing service: SliceJob queue, PrusaSlicer CLI worker, /api/slicer routes"
```

---

### Task 2: Frontend integration (shared panel + four touch points)

**Files:**
- Create: `platform/frontend/src/api/slicer.ts`
- Create: `platform/frontend/src/components/SliceUploadPanel.tsx`
- Create: `platform/frontend/tests/SliceUploadPanel.test.tsx`
- Create: `platform/frontend/src/pages/slicer/SlicerToolPage.tsx`
- Create: `platform/frontend/tests/SlicerToolPage.test.tsx`
- Modify: `platform/frontend/src/components/AppShell.tsx` (add `/slicer` nav entry, `adminOnly: false`)
- Modify: `platform/frontend/src/App.tsx` (add `/slicer` route)
- Modify: `platform/frontend/src/pages/costingTemplates/CostingTemplateFormPage.tsx` (or the equivalent create/edit form file — confirm exact name via `ls platform/frontend/src/pages/costingTemplates/`)
- Modify: `platform/frontend/tests/CostingTemplatesPages.test.tsx` (or equivalent)
- Modify: `platform/frontend/src/pages/jobCards/` print-intake form file (confirm exact name via `ls`)
- Modify: `platform/frontend/tests/JobCardsPages.test.tsx` (or equivalent)
- Modify: `platform/frontend/src/pages/quotes/` line-item form file (confirm exact name via `ls`)
- Modify: `platform/frontend/tests/QuotesPages.test.tsx` (or equivalent)

**Interfaces:**
- Consumes: `POST /api/slicer/jobs`, `GET /api/slicer/jobs/:id` from Task 1.
- Consumes: existing `usePrinters`, `usePrinterPresets`, `useFilaments` hooks (confirm exact names/files via `ls platform/frontend/src/api/`) to populate the panel's selects.
- Produces: `<SliceUploadPanel onResult={(result: SliceResult) => void} />` where `SliceResult = { weightGrams: number; supportWeightGrams: number; filamentLengthMm: number; printTimeHours: number }` — this is the one shared contract every touch point below wires up differently.

- [ ] **Step 1: Confirm exact existing file names before editing**

Run: `ls platform/frontend/src/pages/costingTemplates/ platform/frontend/src/pages/jobCards/ platform/frontend/src/pages/quotes/ platform/frontend/src/api/` and read the relevant create/edit-form files fully before touching them — this plan describes the integration by behavior, not by guessed file content, because those files were written by earlier features this session and their exact current shape must be read firsthand.

- [ ] **Step 2: Write the frontend API hooks**

Create `platform/frontend/src/api/slicer.ts`, following `scanners.ts`'s exact style (`useMutation`/`useQuery` pairs, `apiPost`/`apiGet` from `./client.js`). Two hooks:
```ts
export function useCreateSliceJob() {
  return useMutation({
    mutationFn: (input: { file: File; printerId?: string; printerPresetId?: string; filamentId?: string }) => {
      const formData = new FormData();
      formData.append('file', input.file);
      if (input.printerId) formData.append('printerId', input.printerId);
      if (input.printerPresetId) formData.append('printerPresetId', input.printerPresetId);
      if (input.filamentId) formData.append('filamentId', input.filamentId);
      return apiPostFormData<{ job: SliceJob }>('/api/slicer/jobs', formData).then((r) => r.job);
    },
  });
}

export function useSliceJob(id: string | undefined) {
  return useQuery({
    queryKey: ['sliceJobs', id],
    queryFn: () => apiGet<{ job: SliceJob }>(`/api/slicer/jobs/${id}`).then((r) => r.job),
    enabled: id !== undefined,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'queued' || status === 'processing' ? 2000 : false;
    },
  });
}
```
Check `platform/frontend/src/api/client.ts` for whether an `apiPostFormData` (or equivalent multipart helper) already exists — every other `apiPost` call in this codebase sends JSON, so this is likely new. If it doesn't exist, add it there following `apiPost`'s existing error-handling/credentials conventions, just without setting a `Content-Type: application/json` header (the browser sets the correct multipart boundary automatically when the body is a `FormData`).

- [ ] **Step 3: Write the shared `SliceUploadPanel` component**

Create `platform/frontend/src/components/SliceUploadPanel.tsx`: a file input (`.stl` accept filter), `<select>`s for printer/preset/filament (populated via the existing hooks confirmed in Step 1), a "Slice" button that calls `useCreateSliceJob`, then polls via `useSliceJob` with the returned id. While `queued`/`processing`, show a spinner/progress state; on `done`, call the `onResult` prop with the four numeric fields and also render them inline (weight, support weight, length, time) so the panel is self-sufficiently useful even where `onResult` just logs; on `failed`, show `job.errorMessage` in an inline error state with a "try again" reset.

- [ ] **Step 4: Test `SliceUploadPanel`**

Create `platform/frontend/tests/SliceUploadPanel.test.tsx`, following this repo's existing frontend test style (check `LaserMaterialsPages.test.tsx` or similar for the mocking convention used for `apiPost`/`apiGet`). Cover: selecting a file and clicking Slice triggers the upload call; while status is `processing`, a loading state renders; once status is `done`, `onResult` is called with the parsed numbers and they render on screen; once status is `failed`, the error message renders.
Run: `npm test -- SliceUploadPanel`
Expected: pass.

- [ ] **Step 5: Standalone Slicer page**

Create `platform/frontend/src/pages/slicer/SlicerToolPage.tsx`: just renders `<SliceUploadPanel onResult={...} />` with the result additionally displayed in a simple summary card (the panel already shows the numbers, so this page can be thin — mirror the plainest existing top-level page in the app, e.g. `MaterialsListPage.tsx`, for the surrounding page-chrome convention). Add the route in `App.tsx` and the nav entry in `AppShell.tsx`'s `NAV_ITEMS` (`{ to: '/slicer', label: 'Slicer', adminOnly: false }`, placed near `/costing-templates`).

- [ ] **Step 6: Test the standalone page**

Create `platform/frontend/tests/SlicerToolPage.test.tsx` verifying the page renders the panel and the route is reachable (mirror an existing simple page test for structure).
Run: `npm test -- SlicerToolPage`
Expected: pass.

- [ ] **Step 7: Costing Templates integration**

In the printer-process Costing Template create/edit form (exact file confirmed in Step 1), add a "Slice STL" button next to the `weightGrams`/`printTimeHours` fields that opens `<SliceUploadPanel>` in a modal (reuse whatever modal/dialog pattern this form or a sibling form already uses — check `JobCardFormPage` or similar for an existing modal convention before inventing a new one). On `onResult`, set the form's `weightGrams` and `printTimeHours` fields to the returned values (still editable afterward) and store the `sliceJobId` from the created job for the eventual `POST` payload (requires adding `sliceJobId?: string | null` to this form's submit payload type and to the corresponding backend `CreateCostingTemplateInput` in `scoped.ts`/`costing-templates.ts` — a small addition alongside Task 1's schema change, confirm it was included there or add it now if missed).

- [ ] **Step 8: Test the Costing Templates integration**

Extend the existing Costing Templates frontend test file with a case: opening the slice modal, completing a mocked slice, and confirming the form's weight/time fields are populated with the mocked result.
Run: `npm test -- CostingTemplate`
Expected: pass, and the full existing frontend suite still passes (no regression in the untouched parts of that form).

- [ ] **Step 9: Job Cards integration**

In the print-type Job Card intake form (exact file confirmed in Step 1), add an STL file field. Slicing can be triggered either immediately on file selection (reusing `<SliceUploadPanel>`) or via a small inline "Slice" button next to the file field — pick whichever fits the existing form's layout more naturally, since this form is longer and more section-based than Costing Templates' (read it first). On result, populate `stlFileName`, `sliceWeightGrams`, `sliceSupportWeightGrams`, `sliceFilamentLengthMm`, `slicePrintTimeHours`, `sliceJobId` in the form's submit payload (added to `CreateJobCardInput`/`JobCardTypeFields` in `scoped.ts` back in Task 1 — same confirm-or-add check as Step 7). Add a read-only display of these fields on the Job Card detail page, in the existing "Print fields" section, only rendered when `cardType === 'print'` and a slice result is present (mirror how other conditionally-shown print-only fields are already rendered there).

- [ ] **Step 10: Test the Job Cards integration**

Extend the existing Job Cards frontend test file with: submitting a print-type intake with a sliced STL populates the four result fields on create; the Job Card detail page shows those fields when present and omits the section entirely when absent (e.g. a repair-type card, or a print-type card with no file attached).
Run: `npm test -- JobCard`
Expected: pass.

- [ ] **Step 11: Quotes integration**

In the Quote line-item form (exact file confirmed in Step 1), add a "Slice a file to build this line" action that opens `<SliceUploadPanel>`. On result, instead of filling fields on the quote line itself (there are none to fill — see the design spec), navigate/transition straight into this form's EXISTING "create/attach a Costing Template" flow (whatever that currently looks like — read it first; it's the same flow already used when manually building a quote line from a costing template), pre-filling that sub-form's `weightGrams`/`printTimeHours`/`sliceJobId` fields exactly as Step 7 does. Saving that sub-form attaches the resulting `costingTemplateId` to the quote line, unchanged from the existing behavior.

- [ ] **Step 12: Test the Quotes integration**

Extend the existing Quotes frontend test file with a case: triggering the slice-then-create-costing-template flow from a quote line, completing a mocked slice, confirming the resulting costing template sub-form is pre-filled, and that saving it attaches the line with the expected `costingTemplateId`.
Run: `npm test -- Quote`
Expected: pass, and the full existing frontend suite still passes.

- [ ] **Step 13: Typecheck, full test suite, commit**

Run: `npm run typecheck && npm test`
Expected: both clean, full suite green (not just the new test files).

```bash
git add platform/frontend/src
git add platform/frontend/tests
git commit -m "Add frontend slicer integration: standalone tool, Costing Templates, Job Cards, Quotes"
```

---

## After both tasks: ops note for the controller (not a subagent task)

Before deploying, the controller must install PrusaSlicer's console-only Linux build on the VPS and verify `systemd-run --scope` works for the `deploy` user (or confirm the `SLICER_USE_SYSTEMD=false` fallback is acceptable for launch) — this is infrastructure work outside the repo, done directly on the VPS during the deploy step, not by a dispatched subagent. Add `SLICER_MAX_CONCURRENCY`, `SLICER_TIMEOUT_SECONDS`, `SLICER_SCRATCH_DIR`, and `SLICER_BINARY_PATH` (pointing at wherever the CLI binary lands) to the production `.env` before restarting `barkie-api`.
