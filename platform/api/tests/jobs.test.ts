import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildApp } from '../src/app.js';
import { buildMinimalApp, loggedInAgent, resetTestDatabase } from './helpers/testApp.js';
import { jobsRouter } from '../src/routes/jobs.js';

beforeEach(resetTestDatabase);

async function createCostingTemplate(agent: ReturnType<typeof request.agent>, name = 'Standard PLA bracket') {
  const filamentRes = await agent.post('/api/filaments').send({
    brand: 'eSun',
    materialType: 'PLA',
    diameterMm: 1.75,
    costPerKg: 350,
  });
  const printerRes = await agent.post('/api/printers').send({
    name: 'Prusa MK4',
    purchaseCost: 10000,
    powerDrawWatts: 200,
    electricityRatePerKwh: 2.5,
    expectedLifetimeHours: 5000,
  });
  const templateRes = await agent.post('/api/costing-templates').send({
    name,
    filamentId: filamentRes.body.filament.id,
    weightGrams: 50,
    printerId: printerRes.body.printer.id,
    printTimeHours: 2,
    markupPercent: 50,
  });
  assert.equal(templateRes.status, 201);
  return templateRes.body.costingTemplate;
}

test('job endpoints require auth', async () => {
  const app = buildMinimalApp(jobsRouter);
  const res = await request(app).get('/api/jobs');
  assert.equal(res.status, 401);
});

test('POST /api/jobs 400s for an unknown costingTemplateId', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const res = await agent.post('/api/jobs').send({ costingTemplateId: 'does-not-exist' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'Costing template not found.');
});

test('POST /api/jobs creates a job with status backlog and the template name snapshotted', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const template = await createCostingTemplate(agent);

  const res = await agent.post('/api/jobs').send({ costingTemplateId: template.id });
  assert.equal(res.status, 201);
  assert.equal(res.body.job.status, 'backlog');
  assert.equal(res.body.job.name, template.name);
  assert.equal(res.body.job.costingTemplateId, template.id);
  assert.equal(res.body.job.startedAt, null);
  assert.equal(res.body.job.completedAt, null);

  const listRes = await agent.get('/api/jobs');
  assert.equal(listRes.status, 200);
  assert.equal(listRes.body.jobs.length, 1);
});

test('PATCH /api/jobs/:id/status moves through statuses and sets startedAt only on the first move out of backlog', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const template = await createCostingTemplate(agent);
  const createRes = await agent.post('/api/jobs').send({ costingTemplateId: template.id });
  const jobId = createRes.body.job.id;

  const firstMove = await agent.patch(`/api/jobs/${jobId}/status`).send({ status: 'slicing' });
  assert.equal(firstMove.status, 200);
  assert.ok(firstMove.body.job.startedAt);
  const startedAtAfterFirstMove = firstMove.body.job.startedAt;

  const secondMove = await agent.patch(`/api/jobs/${jobId}/status`).send({ status: 'printing' });
  assert.equal(secondMove.status, 200);
  assert.equal(secondMove.body.job.startedAt, startedAtAfterFirstMove, 'startedAt must not be overwritten on a later move');
});

test('PATCH /api/jobs/:id/status any status is a valid target from any other status', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const template = await createCostingTemplate(agent);
  const createRes = await agent.post('/api/jobs').send({ costingTemplateId: template.id });
  const jobId = createRes.body.job.id;

  const toPrinting = await agent.patch(`/api/jobs/${jobId}/status`).send({ status: 'printing' });
  assert.equal(toPrinting.status, 200);
  assert.equal(toPrinting.body.job.status, 'printing');

  // A print fails and needs re-slicing -- moving backward is a valid move,
  // unlike Invoice's strict status-transition map (see the design spec's
  // "Scope decision" section).
  const backToBacklog = await agent.patch(`/api/jobs/${jobId}/status`).send({ status: 'backlog' });
  assert.equal(backToBacklog.status, 200);
  assert.equal(backToBacklog.body.job.status, 'backlog');
});

test('PATCH /api/jobs/:id/status sets and clears completedAt entering/leaving done', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const template = await createCostingTemplate(agent);
  const createRes = await agent.post('/api/jobs').send({ costingTemplateId: template.id });
  const jobId = createRes.body.job.id;

  const toDone = await agent.patch(`/api/jobs/${jobId}/status`).send({ status: 'done' });
  assert.equal(toDone.status, 200);
  assert.ok(toDone.body.job.completedAt);

  const backToPrinting = await agent.patch(`/api/jobs/${jobId}/status`).send({ status: 'printing' });
  assert.equal(backToPrinting.status, 200);
  assert.equal(backToPrinting.body.job.completedAt, null);
});

test('PATCH /api/jobs/:id/status rejects an invalid status', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const template = await createCostingTemplate(agent);
  const createRes = await agent.post('/api/jobs').send({ costingTemplateId: template.id });
  const jobId = createRes.body.job.id;

  const res = await agent.patch(`/api/jobs/${jobId}/status`).send({ status: 'not-a-real-status' });
  assert.equal(res.status, 400);
});

test('PATCH /api/jobs/:id/status 404s for a job belonging to another tenant', async () => {
  const app = buildApp();
  const agentA = await loggedInAgent(app, 'jobs-a@example.co.za');
  const template = await createCostingTemplate(agentA);
  const createRes = await agentA.post('/api/jobs').send({ costingTemplateId: template.id });
  const jobId = createRes.body.job.id;

  const agentB = await loggedInAgent(app, 'jobs-b@example.co.za');
  const res = await agentB.patch(`/api/jobs/${jobId}/status`).send({ status: 'slicing' });
  assert.equal(res.status, 404);
});

test('PATCH /api/jobs/:id updates notes without touching status', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const template = await createCostingTemplate(agent);
  const createRes = await agent.post('/api/jobs').send({ costingTemplateId: template.id });
  const jobId = createRes.body.job.id;

  const res = await agent.patch(`/api/jobs/${jobId}`).send({ notes: 'Customer wants matte finish' });
  assert.equal(res.status, 200);
  assert.equal(res.body.job.notes, 'Customer wants matte finish');
  assert.equal(res.body.job.status, 'backlog');
});

test('PATCH /api/jobs/:id 404s for a job belonging to another tenant', async () => {
  const app = buildApp();
  const agentA = await loggedInAgent(app, 'jobs-a2@example.co.za');
  const template = await createCostingTemplate(agentA);
  const createRes = await agentA.post('/api/jobs').send({ costingTemplateId: template.id });
  const jobId = createRes.body.job.id;

  const agentB = await loggedInAgent(app, 'jobs-b2@example.co.za');
  const res = await agentB.patch(`/api/jobs/${jobId}`).send({ notes: 'hijacked' });
  assert.equal(res.status, 404);
});
