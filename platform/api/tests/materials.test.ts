import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildApp } from '../src/app.js';
import { buildMinimalApp, loggedInAgent, resetTestDatabase } from './helpers/testApp.js';
import { materialsRouter } from '../src/routes/materials.js';
import { prisma } from '../src/db/client.js';

beforeEach(resetTestDatabase);

// Material is a global (non-tenant-scoped) model — see the design spec's
// "Scope decision" section. Tests seed a handful of fixture rows directly
// rather than depending on the real seed script (prisma/seed.ts) having run
// against the test database.
const FIXTURE_MATERIALS = [
  {
    id: 'pla',
    name: 'PLA',
    chemistry: 'Polylactic acid',
    bestFor: 'Display models, prototypes and light indoor parts',
    nozzleTempC: 200,
    bedTempC: 60,
    requiresEnclosure: false,
    requiresHardenedNozzle: false,
    requiresDirectDrive: false,
    recommendsDryFilament: false,
    recommendsVentilation: false,
    difficulty: 'Beginner',
    moisture: 'Low',
    abrasive: false,
    priceZarPerKgLow: 295,
    priceZarPerKgHigh: 425,
    priceEstimated: false,
    whyChooseIt: 'Prints cleanly on almost any machine with no tuning.',
    avoidWhenText: 'The part will sit in a hot car or carry sustained load.',
    tags: ['beginner-friendly'],
  },
  {
    id: 'petg',
    name: 'PETG',
    chemistry: 'Glycol-modified PET',
    bestFor: 'Everyday functional parts',
    nozzleTempC: 230,
    bedTempC: 70,
    requiresEnclosure: false,
    requiresHardenedNozzle: false,
    requiresDirectDrive: false,
    recommendsDryFilament: true,
    recommendsVentilation: false,
    difficulty: 'Beginner',
    moisture: 'Medium',
    abrasive: false,
    priceZarPerKgLow: 290,
    priceZarPerKgHigh: 450,
    priceEstimated: false,
    whyChooseIt: 'Strong and a little flexible.',
    avoidWhenText: 'You need crisp fine detail.',
    tags: ['beginner-friendly'],
  },
  {
    id: 'tpu-95a',
    name: 'TPU (95A)',
    chemistry: 'Thermoplastic polyurethane',
    bestFor: 'Phone cases, gaskets and flexible hinges',
    nozzleTempC: 225,
    bedTempC: 50,
    requiresEnclosure: false,
    requiresHardenedNozzle: false,
    requiresDirectDrive: true,
    recommendsDryFilament: true,
    recommendsVentilation: false,
    difficulty: 'Intermediate',
    moisture: 'Medium',
    abrasive: false,
    priceZarPerKgLow: 350,
    priceZarPerKgHigh: 550,
    priceEstimated: false,
    whyChooseIt: 'Rubber-like flexibility with real durability.',
    avoidWhenText: 'Your printer has an untuned Bowden setup.',
    tags: ['flexible'],
  },
];

async function seedMaterials() {
  for (const material of FIXTURE_MATERIALS) {
    await prisma.material.create({ data: material });
  }
}

test('material endpoints require auth', async () => {
  const app = buildMinimalApp(materialsRouter);
  const listRes = await request(app).get('/api/materials');
  assert.equal(listRes.status, 401);
  const detailRes = await request(app).get('/api/materials/pla');
  assert.equal(detailRes.status, 401);
});

test('GET /api/materials returns the seeded materials', async () => {
  await seedMaterials();
  const app = buildApp();
  const agent = await loggedInAgent(app);

  const res = await agent.get('/api/materials');
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.materials.length, 3);
  const names = res.body.materials.map((m: { name: string }) => m.name).sort();
  assert.deepEqual(names, ['PETG', 'PLA', 'TPU (95A)']);
});

test('GET /api/materials?tag= filters by tag', async () => {
  await seedMaterials();
  const app = buildApp();
  const agent = await loggedInAgent(app);

  const res = await agent.get('/api/materials?tag=flexible');
  assert.equal(res.status, 200);
  assert.equal(res.body.materials.length, 1);
  assert.equal(res.body.materials[0].id, 'tpu-95a');
});

test('GET /api/materials?tag= with no matches returns an empty list', async () => {
  await seedMaterials();
  const app = buildApp();
  const agent = await loggedInAgent(app);

  const res = await agent.get('/api/materials?tag=food-safe');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.materials, []);
});

test('GET /api/materials/:id returns 404 for an unknown id', async () => {
  await seedMaterials();
  const app = buildApp();
  const agent = await loggedInAgent(app);

  const res = await agent.get('/api/materials/not-a-real-material');
  assert.equal(res.status, 404);
  assert.equal(res.body.ok, false);
  assert.equal(res.body.error, 'Material not found.');
});

test('GET /api/materials/:id returns 200 with the full material for a known id', async () => {
  await seedMaterials();
  const app = buildApp();
  const agent = await loggedInAgent(app);

  const res = await agent.get('/api/materials/petg');
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.material.id, 'petg');
  assert.equal(res.body.material.name, 'PETG');
  assert.equal(res.body.material.priceZarPerKgLow, 290);
  assert.equal(res.body.material.priceZarPerKgHigh, 450);
});
