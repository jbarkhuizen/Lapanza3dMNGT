import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildApp } from '../src/app.js';
import { buildMinimalApp, loggedInAgent, resetTestDatabase } from './helpers/testApp.js';
import { reportsRouter } from '../src/routes/reports.js';

beforeEach(resetTestDatabase);

test('reports endpoints require auth', async () => {
  const app = buildMinimalApp(reportsRouter);
  const res = await request(app).get('/api/reports/summary');
  assert.equal(res.status, 401);
});

async function createCostingTemplate(agent: ReturnType<typeof request.agent>) {
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
    name: 'Standard bracket',
    filamentId: filamentRes.body.filament.id,
    weightGrams: 50,
    printerId: printerRes.body.printer.id,
    printTimeHours: 2,
    markupPercent: 50,
  });
  assert.equal(templateRes.status, 201);
  return templateRes.body.costingTemplate;
}

test('GET /api/reports/summary matches fixture data: a paid invoice, an open quote, a low-stock filament, an overdue invoice, an in-progress job', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);

  const customerRes = await agent.post('/api/customers').send({ name: 'Summary Co', billingAddress: '1 Main St' });
  const customerId = customerRes.body.customer.id;

  // A paid invoice -- contributes to totalRevenue.
  const paidInvoiceRes = await agent.post('/api/invoices').send({
    customerId,
    lineItems: [{ description: 'Paid widget', unitPrice: 250, quantity: 1 }],
  });
  assert.equal(paidInvoiceRes.status, 201);
  const paidInvoiceId = paidInvoiceRes.body.invoice.id;
  const markPaidRes = await agent.patch(`/api/invoices/${paidInvoiceId}/status`).send({ status: 'paid', amountPaid: 250 });
  assert.equal(markPaidRes.status, 200);

  // An overdue invoice -- past due, still unpaid. Does not count toward revenue.
  const pastDueDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const overdueInvoiceRes = await agent.post('/api/invoices').send({
    customerId,
    dueDate: pastDueDate,
    lineItems: [{ description: 'Overdue widget', unitPrice: 75, quantity: 1 }],
  });
  assert.equal(overdueInvoiceRes.status, 201);
  const overdueInvoiceId = overdueInvoiceRes.body.invoice.id;

  // An open quote (draft).
  const quoteRes = await agent.post('/api/quotes').send({
    customerId,
    lineItems: [{ description: 'Quoted widget', unitPrice: 500, quantity: 1 }],
  });
  assert.equal(quoteRes.status, 201);
  assert.equal(quoteRes.body.quote.status, 'draft');

  // A low-stock filament.
  const lowStockFilamentRes = await agent.post('/api/filaments').send({
    brand: 'Prusament',
    materialType: 'PETG',
    diameterMm: 1.75,
    remainingWeightGrams: 30,
    lowStockThresholdGrams: 100,
  });
  assert.equal(lowStockFilamentRes.status, 201);
  const lowStockFilamentId = lowStockFilamentRes.body.filament.id;

  // An in-progress job.
  const template = await createCostingTemplate(agent);
  const jobRes = await agent.post('/api/jobs').send({ costingTemplateId: template.id });
  assert.equal(jobRes.status, 201);
  const inProgressJobRes = await agent.patch(`/api/jobs/${jobRes.body.job.id}/status`).send({ status: 'printing' });
  assert.equal(inProgressJobRes.status, 200);

  const summaryRes = await agent.get('/api/reports/summary');
  assert.equal(summaryRes.status, 200);
  assert.equal(summaryRes.body.totalRevenue, '250.00');
  assert.equal(summaryRes.body.openQuotesCount, 1);
  assert.equal(summaryRes.body.jobsInProgress, 1);

  assert.equal(summaryRes.body.overdueInvoices.length, 1);
  assert.equal(summaryRes.body.overdueInvoices[0].id, overdueInvoiceId);

  assert.equal(summaryRes.body.lowStockItems.length, 1);
  assert.equal(summaryRes.body.lowStockItems[0].kind, 'filament');
  assert.equal(summaryRes.body.lowStockItems[0].id, lowStockFilamentId);
});

test('GET /api/reports/summary returns zeroed-out values with no data', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);

  const res = await agent.get('/api/reports/summary');
  assert.equal(res.status, 200);
  assert.equal(res.body.totalRevenue, '0.00');
  assert.equal(res.body.openQuotesCount, 0);
  assert.equal(res.body.jobsInProgress, 0);
  assert.deepEqual(res.body.overdueInvoices, []);
  assert.deepEqual(res.body.lowStockItems, []);
});

test('GET /api/reports/summary is tenant-isolated', async () => {
  const app = buildApp();
  const agentA = await loggedInAgent(app, 'report-a@example.co.za');
  const customerRes = await agentA.post('/api/customers').send({ name: 'A Co', billingAddress: '1 Main St' });
  const invoiceRes = await agentA.post('/api/invoices').send({
    customerId: customerRes.body.customer.id,
    lineItems: [{ description: 'Widget', unitPrice: 100, quantity: 1 }],
  });
  await agentA.patch(`/api/invoices/${invoiceRes.body.invoice.id}/status`).send({ status: 'paid', amountPaid: 100 });

  const agentB = await loggedInAgent(app, 'report-b@example.co.za');
  const summaryB = await agentB.get('/api/reports/summary');
  assert.equal(summaryB.status, 200);
  assert.equal(summaryB.body.totalRevenue, '0.00');
});
