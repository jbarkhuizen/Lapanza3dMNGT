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
  assert.equal(
    res.body.error,
    'This printer is missing an electricity rate, power draw, expected lifetime, or purchase cost — set these before costing a job on it.',
  );
});

test('rejects a printer missing powerDrawWatts', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const filamentRes = await agent.post('/api/filaments').send({
    brand: 'eSun', materialType: 'PLA', diameterMm: 1.75, costPerKg: 300,
  });
  const printerRes = await agent.post('/api/printers').send({
    name: 'No wattage printer',
    purchaseCost: 4000,
    electricityRatePerKwh: 2.5,
    expectedLifetimeHours: 2000,
  });

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
  assert.equal(
    res.body.error,
    'This printer is missing an electricity rate, power draw, expected lifetime, or purchase cost — set these before costing a job on it.',
  );
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

test('rejects a filament belonging to another tenant', async () => {
  const app = buildApp();
  const agentA = await loggedInAgent(app, 'jane@acmeprints.co.za');
  const refsA = await setUpReferenceData(agentA);
  const agentB = await loggedInAgent(app, 'bob@othershop.co.za');
  const refsB = await setUpReferenceData(agentB);

  const res = await agentB.post('/api/costing-templates').send({
    name: 'Test',
    filamentId: refsA.filamentId,
    weightGrams: 50,
    printerId: refsB.printerId,
    printTimeHours: 1,
    markupPercent: 0,
    labourLines: [],
    consumableLines: [],
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'Filament not found.');
});

test('rejects a printer belonging to another tenant', async () => {
  const app = buildApp();
  const agentA = await loggedInAgent(app, 'jane@acmeprints.co.za');
  const refsA = await setUpReferenceData(agentA);
  const agentB = await loggedInAgent(app, 'bob@othershop.co.za');
  const refsB = await setUpReferenceData(agentB);

  const res = await agentB.post('/api/costing-templates').send({
    name: 'Test',
    filamentId: refsB.filamentId,
    weightGrams: 50,
    printerId: refsA.printerId,
    printTimeHours: 1,
    markupPercent: 0,
    labourLines: [],
    consumableLines: [],
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'Printer not found.');
});

test('rejects a labour step belonging to another tenant', async () => {
  const app = buildApp();
  const agentA = await loggedInAgent(app, 'jane@acmeprints.co.za');
  const refsA = await setUpReferenceData(agentA);
  const agentB = await loggedInAgent(app, 'bob@othershop.co.za');
  const refsB = await setUpReferenceData(agentB);

  const res = await agentB.post('/api/costing-templates').send({
    name: 'Test',
    filamentId: refsB.filamentId,
    weightGrams: 50,
    printerId: refsB.printerId,
    printTimeHours: 1,
    markupPercent: 0,
    labourLines: [{ labourStepId: refsA.labourStepId, hours: 1 }],
    consumableLines: [],
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'One of the labour steps was not found.');
});

test('rejects a consumable belonging to another tenant', async () => {
  const app = buildApp();
  const agentA = await loggedInAgent(app, 'jane@acmeprints.co.za');
  const refsA = await setUpReferenceData(agentA);
  const agentB = await loggedInAgent(app, 'bob@othershop.co.za');
  const refsB = await setUpReferenceData(agentB);

  const res = await agentB.post('/api/costing-templates').send({
    name: 'Test',
    filamentId: refsB.filamentId,
    weightGrams: 50,
    printerId: refsB.printerId,
    printTimeHours: 1,
    markupPercent: 0,
    labourLines: [],
    consumableLines: [{ consumableId: refsA.consumableId, quantity: 1 }],
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'One of the consumables was not found.');
});

test('persisted snapshot rates reproduce their persisted costs after rounding', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const filamentRes = await agent.post('/api/filaments').send({
    brand: 'eSun', materialType: 'PLA', diameterMm: 1.75, costPerKg: 300,
  });
  const printerRes = await agent.post('/api/printers').send({
    name: 'Printer 1', powerDrawWatts: 200, purchaseCost: 4000,
    electricityRatePerKwh: 2.5, expectedLifetimeHours: 2000,
  });
  const labourRes = await agent.post('/api/labour-steps').send({ name: 'Slicing', hourlyRate: 45.335 });
  const consumableRes = await agent.post('/api/consumables').send({
    name: 'Adhesive', category: 'build-plate-adhesive', unitOfMeasure: 'each', costPerUnit: 0.125,
  });

  const res = await agent.post('/api/costing-templates').send({
    name: 'Fractional rates test',
    filamentId: filamentRes.body.filament.id,
    weightGrams: 50,
    printerId: printerRes.body.printer.id,
    printTimeHours: 2,
    markupPercent: 12.345,
    labourLines: [{ labourStepId: labourRes.body.labourStep.id, hours: 2 }],
    consumableLines: [{ consumableId: consumableRes.body.consumable.id, quantity: 7 }],
  });
  assert.equal(res.status, 201);
  const t = res.body.costingTemplate;
  assert.equal(t.markupPercent, '12.35');
  assert.equal(t.labourLines[0].hourlyRateSnapshot, '45.34');
  assert.equal(t.labourLines[0].lineCost, '90.68');
  assert.equal(t.consumableLines[0].costPerUnitSnapshot, '0.13');
  assert.equal(t.consumableLines[0].lineCost, '0.91');
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
