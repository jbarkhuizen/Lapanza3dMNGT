// Single in-process worker loop that drains the SliceJob queue -- see
// docs/superpowers/specs/2026-09-13-slicer-integration-design.md. Started
// once from src/server.ts (never from buildApp()/tests -- see
// startSlicerWorker's own comment, mirroring startNotificationScheduler's).
import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../env.js';
import { tenantScope, findOldestQueuedSliceJobAcrossAllTenants, sweepStaleProcessingSliceJobs } from '../db/scoped.js';
import { validateStlBuffer } from './stlValidator.js';
import { buildSlicerProfile } from './profileBuilder.js';
import { parseGcodeFooter } from './gcodeParser.js';

// Read from process.env on every call (NOT frozen into a module-level
// const at import time) specifically so tests can flip
// SLICER_BINARY_PATH/SLICER_USE_SYSTEMD per-test via process.env before
// calling runWorkerTickForTests -- worker.ts is statically imported (via
// routes/slicer.ts) by every test file that calls buildApp(), well before
// any of a test's own top-level code runs (ESM import hoisting), so a
// module-level `const` computed once at import time could never be
// overridden from within a test file.
function slicerBinaryPath(): string {
  return process.env.SLICER_BINARY_PATH ?? 'prusa-slicer-console';
}

// true unless explicitly disabled — production always uses systemd-run;
// tests/dev set SLICER_USE_SYSTEMD=false to skip the wrapper that isn't
// available in CI/dev containers.
function useSystemdScope(): boolean {
  return process.env.SLICER_USE_SYSTEMD !== 'false';
}

// The uploaded STL's bytes are NEVER a SliceJob column -- large binary blobs
// don't belong in the relational row, and the file only needs to exist for
// the few seconds between upload and slice. The route (src/routes/slicer.ts)
// stashes the buffer here on creation; this worker reads/deletes it when it
// actually processes the job.
export const pendingSliceUploads = new Map<string, Buffer>();

function spawnSlicer(args: string[]) {
  const binaryPath = slicerBinaryPath();
  if (useSystemdScope()) {
    return spawn('systemd-run', [
      '--scope', '-p', 'MemoryMax=400M', '-p', 'CPUQuota=85%', '--',
      binaryPath, ...args,
    ]);
  }
  // Test stub binaries (see tests/fixtures/slicer-stub-binary.js) are plain
  // Node scripts, not real executables -- spawning a `.js` file directly
  // fails cross-platform (no shebang support on Windows, and even on POSIX
  // it'd need chmod +x). Route those through the Node executable instead.
  // Production's SLICER_BINARY_PATH always names the real prusa-slicer-console
  // binary, never a `.js` file, so this branch never fires outside tests.
  if (binaryPath.endsWith('.js')) {
    return spawn(process.execPath, [binaryPath, ...args]);
  }
  return spawn(binaryPath, args);
}

interface QueuedSliceJob {
  id: string;
  tenantId: string;
  printerId: string | null;
  printerPresetId: string | null;
  filamentId: string | null;
}

async function runOneJob(job: QueuedSliceJob) {
  const scoped = tenantScope(job.tenantId);
  const stlBuffer = pendingSliceUploads.get(job.id);
  pendingSliceUploads.delete(job.id);

  await scoped.sliceJobs.markProcessing(job.id);

  if (!stlBuffer) {
    // Shouldn't normally happen (the buffer is only ever removed here, and
    // only after this same job has already run once) -- but if it does
    // (e.g. a server restart wiped the in-memory map while the row was
    // stuck 'processing' and got swept back to 'queued'), fail loudly
    // rather than crash the worker loop.
    await scoped.sliceJobs.markFailed(job.id, 'Uploaded file is no longer available — please re-upload and try again.');
    return;
  }

  const jobDir = path.join(env.slicerScratchDir, job.id);
  await mkdir(jobDir, { recursive: true });
  const stlPath = path.join(jobDir, 'model.stl');
  const profilePath = path.join(jobDir, 'profile.ini');
  const gcodePath = path.join(jobDir, 'out.gcode');

  try {
    validateStlBuffer(stlBuffer); // already validated at upload time; re-checked here defensively before the (expensive) child process runs
    await writeFile(stlPath, stlBuffer);

    const printer = job.printerId ? await scoped.printers.findById(job.printerId) : null;
    const preset = job.printerPresetId && job.printerId
      ? await scoped.printerPresets.findById(job.printerId, job.printerPresetId)
      : null;
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
  workerLoopHandle = setInterval(() => {
    void tick();
  }, 2000);
}

async function tick() {
  await sweepStaleJobs();
  // NOTE: SLICER_MAX_CONCURRENCY > 1 support is intentionally not built here —
  // see the design spec's config-not-hardcoded rationale. Raising the env var
  // beyond 1 today does nothing until a future task adds a concurrent-slot
  // pool; documented in env.ts's own comment for this var.
  const next = await findOldestQueuedSliceJobAcrossAllTenants();
  if (next) await runOneJob(next);
}

export function stopSlicerWorker() {
  if (workerLoopHandle) clearInterval(workerLoopHandle);
  workerLoopHandle = null;
}

// Exported for tests: runs exactly one worker tick synchronously (sweep +
// at most one job), without the setInterval loop — see slicer.test.ts's
// "full cycle" case, which needs a deterministic single pass rather than
// waiting on a real 2-second interval.
export async function runWorkerTickForTests() {
  await tick();
}

async function sweepStaleJobs() {
  const staleMs = env.slicerTimeoutSeconds * 1000 * 2; // generous margin over the hard per-job timeout
  await sweepStaleProcessingSliceJobs(staleMs);
}
