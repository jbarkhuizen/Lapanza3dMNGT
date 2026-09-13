# Slicer Integration Design

## Summary

Add server-side STL slicing to Barkie so users get filament weight, support weight, filament length, and print time computed automatically instead of typed in by hand. One shared backend service (`SliceJob` model + a single-worker queue running PrusaSlicer's CLI) backs four UI touch points: a standalone Slicer tool, Costing Templates, Job Cards (print intake), and Quotes.

## Background / motivation

Costing Templates for the `printer` process currently require manually entering `weightGrams` and `printTimeHours` — numbers a slicer computes exactly from an STL and a print profile. Job Cards' print-intake fields and Quotes' printer-costing lines have the same gap. A shared slicing capability removes the guesswork at all three points, plus a standalone "what would this cost to print" tool.

## Constraints that shaped this design

- **Production VPS is 1 vCPU / 1.7GB RAM (~1GB free).** Slicing is CPU/memory-heavy. This rules out running the slicer unthrottled or concurrently with itself, and shapes the whole architecture around a single-worker queue with hard resource caps rather than an on-demand synchronous call. The user has flagged a possible future VPS upgrade — concurrency is a config value (`SLICER_MAX_CONCURRENCY`, default `1`), not hardcoded, so raising it later needs no re-architecture.
- **OrcaSlicer's headless Linux CLI is less mature/harder to automate unattended than PrusaSlicer's.** Decision: use PrusaSlicer's CLI (console-only build, no X11 dependency) as the actual slicing engine. The UI never names either brand — it just says "Slice."
- **No existing file-upload path in the API** (no multer or equivalent). This is a new pattern, introduced narrowly for this feature.
- **No existing long-running-job/polling pattern in the frontend.** Introduced narrowly here via react-query's `refetchInterval`, the same library already used everywhere else in the app.

## Scope decision

Built now, in this round: standalone Slicer tool, Costing Templates integration, Job Cards (print intake) integration, Quotes integration. All four share one backend service — see "Data model" and "API" below — so none of this is duplicated per touch point.

Out of scope for v1 (documented, not silently dropped — see "Out of scope" section at the end).

## Architecture overview

- **Engine:** PrusaSlicer CLI (console-only build), invoked as a short-lived child process per job — not a daemon. Spawned, produces G-code, exits.
- **Queue:** a `SliceJob` DB row tracks every request (`queued → processing → done/failed`). A single in-process worker loop inside the existing API process (started at server boot, alongside the existing notification-checks scheduler) pulls the oldest `queued` job — globally across all tenants, FIFO, `SLICER_MAX_CONCURRENCY` workers at a time (default `1`). Never two slices run at once by default.
- **Resource caps on the child process:** wrapped in `systemd-run --scope -p MemoryMax=400M -p CPUQuota=85%` so a pathological STL can't OOM or starve the box — it gets killed and the job marked `failed` instead. If `systemd-run --user` scopes aren't available on the box at deploy time, fall back to a plain `child_process.spawn` with a Node-side timeout-kill only (no hard memory cap in that degraded mode) — log a warning when this fallback is used so it's visible in ops, not silent.
- **Hard wall-clock timeout:** `SLICER_TIMEOUT_SECONDS` (default `90`). If the child process is still running past this, it is killed and the job marked `failed` with `errorMessage: "slicing timed out"`.
- **Upload safety:** `.stl` only, size-capped at 20MB, and sanity-checked server-side (parse header, verify it is a well-formed binary or ASCII STL, count triangles and reject anything absurd — e.g. more than 2,000,000 triangles) *before* the file is ever handed to the slicer child process. This reuses/ports the lightweight STL parsing logic already written for the landing site's STL Scaler tool (`landing/public/js/stl-scaler-core.js`'s `parseBinarySTL`/bounding-box logic) into a small server-side TS module — the same parsing rules, not a new implementation.
- **Print profile inputs:** built from data already in the schema — `PrinterPreset.layerHeightMm`, `.infillPercent`, `.nozzleTempC`, `.bedTempC`, `.printSpeedMmS`; `Printer.buildVolumeXMm/YMm/ZMm`. One gap: no nozzle diameter today. `Printer` gains `nozzleDiameterMm Float?` (nullable; treated as 0.4mm when unset). When no `PrinterPreset` is linked to a job, per-material default temp/speed profiles are used based on `Filament.materialType` (PLA/PETG/ABS baked-in defaults).
- **Supports:** auto-generated using PrusaSlicer's default overhang-angle threshold in v1. No per-job support toggle yet (see "Out of scope").
- **Output parsing:** PrusaSlicer writes known comment lines into the generated G-code's footer (`; filament used [g]`, `; total filament used [mm]`, `; estimated printing time`). The worker greps these directly rather than parsing toolpaths. If the footer is missing or unparsable, the job is marked `failed` with `errorMessage: "invalid or corrupt STL"` or a generic slicing-failure message as appropriate.
- **Storage:** the uploaded STL and generated G-code live only on disk during processing, at `<SLICER_SCRATCH_DIR>/<jobId>/`, deleted immediately after the job reaches `done` or `failed`. No long-term blob storage, no disk growth over time.
- **Crash recovery:** on worker startup, any `SliceJob` row stuck in `processing` older than `SLICER_TIMEOUT_SECONDS` is swept back to `queued`, so a server restart mid-slice cannot strand a job forever.

## Data model changes

New model:

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

Changes to existing models:

- **`Printer`**: add `nozzleDiameterMm Float?` (nullable; 0.4mm assumed when unset).
- **`JobCard`** (print-type fields section): add `sliceJobId String?`, `stlFileName String?`, `sliceWeightGrams Float?`, `sliceSupportWeightGrams Float?`, `sliceFilamentLengthMm Float?`, `slicePrintTimeHours Float?`. Populated at intake time (or later, if the file is attached after the ticket is created); shown read-only on the Job Card detail page.
- **`CostingTemplate`**: add `sliceJobId String?` (`onDelete: SetNull`) purely for traceability of which slice produced the `weightGrams`/`printTimeHours` values — those two fields already exist and are simply filled by the slice result instead of typed manually.
- **`Quote` / `QuoteLineItem`**: **no schema changes.** `QuoteLineItem` already has `costingTemplateId`. The Quotes integration is a UX shortcut only (see "Frontend integration" below), not new data.

## API

- **`POST /api/slicer/jobs`** — multipart upload (`file` = .stl, plus `printerId?`, `printerPresetId?`, `filamentId?`). Gated by `requireTenantAuth` + `requireActiveSubscription` (existing convention). Validates the file (extension, size cap, STL sanity check) before creating the `SliceJob` row (`status: queued`). Returns `{ id }` immediately — this is a fire-and-poll endpoint, never a blocking call.
- **`GET /api/slicer/jobs/:id`** — tenant-scoped read of a job's current status/result fields. Used for polling.
- **Worker loop**: described under "Architecture overview" above.
- **Frontend polling**: `useQuery` with `refetchInterval` (e.g. 2000ms) while `status` is `queued` or `processing`; stops once `done` or `failed`. Same react-query pattern already used throughout the frontend — no new library.

## Frontend integration

One shared component, `<SliceUploadPanel>` (file picker + printer/preset/filament selects + progress state + result display), reused with a different "on result" callback per touch point:

- **Standalone tool** (new top-level nav item, `/slicer`): the panel alone. Upload, pick printer + filament, see weight / support weight / print time / filament length. Nothing else persists beyond the `SliceJob` row itself.
- **Costing Templates** (printer-process create/edit form): a "Slice STL" button opens the panel in a modal. On result, auto-fills `weightGrams` and `printTimeHours` (still manually editable/overridable afterward) and stores `sliceJobId`.
- **Job Cards** (print-type intake form): an STL upload field is added to the existing print-fields section. Slicing can run at intake time or later if the file is attached after the ticket exists. Results are shown read-only on the Job Card detail page for whoever picks up the ticket next.
- **Quotes** (line item form): a "Slice a file to build this line" action opens the same panel. On result, it walks straight into the existing "create Costing Template" form, pre-filled with the slice numbers; saving that form attaches the new template as the line's `costingTemplateId` — identical to today's manual "create costing template, then attach to quote line" flow, just pre-filled.

## Ops / deployment

- Install PrusaSlicer's console-only Linux build on the VPS (AppImage or static binary; the console build has no GUI/X11 dependency, safe for a headless server).
- New env vars: `SLICER_MAX_CONCURRENCY` (default `1`), `SLICER_TIMEOUT_SECONDS` (default `90`), `SLICER_SCRATCH_DIR`.
- Verify `systemd-run --user` scope permissions for the `deploy` user during rollout; if unavailable, the worker falls back to plain `spawn` + Node-side timeout-kill (degraded mode, no hard memory cap), logging a warning so this is visible in ops rather than silent.
- New dependency: `multer` (multipart upload handling) in `platform/api`.

## Testing

- Unit tests for the STL sanity-check parser: valid binary STL, valid ASCII STL, truncated file, non-STL file, oversized triangle count — adapted from the existing `stlScaler.test.js` fixtures.
- Unit tests for G-code footer parsing: given sample PrusaSlicer output, correctly extract weight/support-weight/length/time; missing or malformed footer is handled as a parse failure, not a crash.
- Integration tests mock the `prusa-slicer-console` binary with a stub script that writes a canned G-code footer, so CI never needs the real slicer installed. These tests cover the queue/status/polling contract (job transitions through `queued`/`processing`/`done`/`failed` correctly, results are parsed and persisted, tenant scoping is enforced), not the actual slicing computation.
- Failure paths covered: oversized upload (413), non-STL file (400), slice timeout (job `failed` with a user-facing message), worker crash mid-job (row swept back to `queued` on restart).

## Out of scope for v1

- Support toggle / infill override at slice time (uses `PrinterPreset` / default-profile values only, not overridden per job).
- Non-STL input formats (3MF, STEP).
- Multi-material or multi-plate slicing.
- Any actual OrcaSlicer/Bambu-specific profile features — the engine is PrusaSlicer CLI; the UI never names either brand.
