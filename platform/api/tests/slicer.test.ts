import { test, beforeEach, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import request from 'supertest';
import { buildApp } from '../src/app.js';
import { buildMinimalApp, loggedInAgent, resetTestDatabase } from './helpers/testApp.js';
import { slicerRouter } from '../src/routes/slicer.js';
import { runWorkerTickForTests } from '../src/slicer/worker.js';

const STUB_BINARY_PATH = path.resolve(process.cwd(), 'tests/fixtures/slicer-stub-binary.js');

let originalBinaryPath: string | undefined;
let originalUseSystemd: string | undefined;
let originalStubMode: string | undefined;

// Points the worker's slicer invocation at the stub script (see
// tests/fixtures/slicer-stub-binary.js) instead of a real PrusaSlicer binary
// for this whole file's run, and skips the systemd-run wrapper (unavailable
// in dev/CI). worker.ts reads these from process.env on every call
// (deliberately not frozen at import time) precisely so this works.
before(() => {
  originalBinaryPath = process.env.SLICER_BINARY_PATH;
  originalUseSystemd = process.env.SLICER_USE_SYSTEMD;
  originalStubMode = process.env.SLICER_STUB_MODE;
  process.env.SLICER_BINARY_PATH = STUB_BINARY_PATH;
  process.env.SLICER_USE_SYSTEMD = 'false';
});

after(() => {
  if (originalBinaryPath === undefined) delete process.env.SLICER_BINARY_PATH;
  else process.env.SLICER_BINARY_PATH = originalBinaryPath;
  if (originalUseSystemd === undefined) delete process.env.SLICER_USE_SYSTEMD;
  else process.env.SLICER_USE_SYSTEMD = originalUseSystemd;
  if (originalStubMode === undefined) delete process.env.SLICER_STUB_MODE;
  else process.env.SLICER_STUB_MODE = originalStubMode;
});

beforeEach(resetTestDatabase);

const HEADER_BYTES = 80;
const TRIANGLE_COUNT_BYTES = 4;
const BYTES_PER_TRIANGLE = 50;

function buildValidStlBuffer(): Buffer {
  const size = HEADER_BYTES + TRIANGLE_COUNT_BYTES + 1 * BYTES_PER_TRIANGLE;
  const buffer = Buffer.alloc(size);
  buffer.writeUInt32LE(1, HEADER_BYTES);
  return buffer;
}

test('slicer endpoints require auth', async () => {
  const app = buildMinimalApp(slicerRouter);
  const res = await request(app).get('/api/slicer/jobs/does-not-exist');
  assert.equal(res.status, 401);
});

test('POST /api/slicer/jobs with no file attached returns 400', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const res = await agent.post('/api/slicer/jobs');
  assert.equal(res.status, 400);
});

test('POST /api/slicer/jobs with a non-.stl filename returns 400', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const res = await agent
    .post('/api/slicer/jobs')
    .attach('file', Buffer.from('not an stl'), 'model.txt');
  assert.equal(res.status, 400);
});

test('POST /api/slicer/jobs with a corrupt/truncated STL returns 400 with the validator message', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const truncated = Buffer.alloc(HEADER_BYTES + TRIANGLE_COUNT_BYTES);
  truncated.writeUInt32LE(5, HEADER_BYTES); // claims 5 triangles, has none
  const res = await agent
    .post('/api/slicer/jobs')
    .attach('file', truncated, 'model.stl');
  assert.equal(res.status, 400);
  assert.match(res.body.error, /truncated|not a valid binary STL/i);
});

test('full cycle: upload -> queued -> worker processes -> done with parsed result', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);

  const createRes = await agent
    .post('/api/slicer/jobs')
    .attach('file', buildValidStlBuffer(), 'model.stl');
  assert.equal(createRes.status, 201);
  assert.equal(createRes.body.job.status, 'queued');
  const jobId = createRes.body.job.id;

  await runWorkerTickForTests();

  const getRes = await agent.get(`/api/slicer/jobs/${jobId}`);
  assert.equal(getRes.status, 200);
  assert.equal(getRes.body.job.status, 'done');
  assert.equal(getRes.body.job.resultWeightGrams, 12.34);
  assert.equal(getRes.body.job.resultSupportWeightGrams, 1.2);
  assert.equal(getRes.body.job.resultFilamentLengthMm, 456.7);
  // Not assert.equal: the value round-trips through Postgres storage and
  // JSON serialization, which can shift the last bit of a double — compare
  // within a tight tolerance instead of expecting bit-for-bit equality.
  assert.ok(Math.abs(getRes.body.job.resultPrintTimeHours - (1 + 23 / 60 + 45 / 3600)) < 1e-9);
});

test('a run against the failing stub variant ends status failed with a non-empty errorMessage', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);

  const createRes = await agent
    .post('/api/slicer/jobs')
    .attach('file', buildValidStlBuffer(), 'model.stl');
  const jobId = createRes.body.job.id;

  process.env.SLICER_STUB_MODE = 'fail';
  try {
    await runWorkerTickForTests();
  } finally {
    delete process.env.SLICER_STUB_MODE;
  }

  const getRes = await agent.get(`/api/slicer/jobs/${jobId}`);
  assert.equal(getRes.body.job.status, 'failed');
  assert.ok(getRes.body.job.errorMessage);
});

test('tenant isolation: tenant A cannot GET tenant B\'s slice job', async () => {
  const app = buildApp();
  const agentA = await loggedInAgent(app, 'jane@acmeprints.co.za');
  const createRes = await agentA
    .post('/api/slicer/jobs')
    .attach('file', buildValidStlBuffer(), 'model.stl');
  const jobId = createRes.body.job.id;

  const agentB = await loggedInAgent(app, 'bob@othershop.co.za');
  const getRes = await agentB.get(`/api/slicer/jobs/${jobId}`);
  assert.equal(getRes.status, 404);
});
