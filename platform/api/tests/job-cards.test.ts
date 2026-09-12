import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildApp } from '../src/app.js';
import { buildMinimalApp, loggedInAgent, resetTestDatabase } from './helpers/testApp.js';
import { jobCardsRouter } from '../src/routes/job-cards.js';

beforeEach(resetTestDatabase);

async function makeCustomer(agent: ReturnType<typeof request.agent>) {
  const res = await agent.post('/api/customers').send({ name: 'Bob Client', billingAddress: '5 Oak St' });
  return res.body.customer.id as string;
}

function repairPayload(overrides: Record<string, unknown> = {}) {
  return {
    cardType: 'repair',
    jobTitle: 'Fix extruder',
    receivedDate: '2026-09-13T00:00:00.000Z',
    equipmentMake: 'Prusa',
    equipmentModel: 'MK4',
    reportedFault: 'Clicking noise',
    receivedWithPowerCord: true,
    ...overrides,
  };
}

function printPayload(overrides: Record<string, unknown> = {}) {
  return {
    cardType: 'print',
    jobTitle: 'Print bracket set',
    receivedDate: '2026-09-13T00:00:00.000Z',
    printFileName: 'bracket.stl',
    printQuantity: 4,
    printMaterial: 'PLA',
    finishRemoveSupports: true,
    ...overrides,
  };
}

function cadPayload(overrides: Record<string, unknown> = {}) {
  return {
    cardType: 'cad',
    jobTitle: 'Design mounting bracket',
    receivedDate: '2026-09-13T00:00:00.000Z',
    cadDesignType: 'Mechanical part',
    cadMaterial: 'Aluminium',
    deliverableStep: true,
    ...overrides,
  };
}

test('job card endpoints require auth', async () => {
  const app = buildMinimalApp(jobCardsRouter);
  const res = await request(app).get('/api/job-cards');
  assert.equal(res.status, 401);
});

test('POST /api/job-cards creates a repair card, numbered JC-0001', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);

  const res = await agent.post('/api/job-cards').send(repairPayload());
  assert.equal(res.status, 201);
  assert.equal(res.body.jobCard.number, 'JC-0001');
  assert.equal(res.body.jobCard.cardType, 'repair');
  assert.equal(res.body.jobCard.status, 'new');
  assert.equal(res.body.jobCard.priority, 'normal');
  assert.equal(res.body.jobCard.equipmentMake, 'Prusa');
  assert.equal(res.body.jobCard.reportedFault, 'Clicking noise');
  assert.equal(res.body.jobCard.receivedWithPowerCord, true);
  assert.equal(res.body.jobCard.printFileName, null);
  assert.equal(res.body.jobCard.cadDesignType, null);
});

test('POST /api/job-cards creates a print card', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);

  const res = await agent.post('/api/job-cards').send(printPayload());
  assert.equal(res.status, 201);
  assert.equal(res.body.jobCard.cardType, 'print');
  assert.equal(res.body.jobCard.printFileName, 'bracket.stl');
  assert.equal(res.body.jobCard.printQuantity, 4);
  assert.equal(res.body.jobCard.finishRemoveSupports, true);
  assert.equal(res.body.jobCard.equipmentMake, null);
});

test('POST /api/job-cards creates a cad card', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);

  const res = await agent.post('/api/job-cards').send(cadPayload());
  assert.equal(res.status, 201);
  assert.equal(res.body.jobCard.cardType, 'cad');
  assert.equal(res.body.jobCard.cadDesignType, 'Mechanical part');
  assert.equal(res.body.jobCard.deliverableStep, true);
  assert.equal(res.body.jobCard.printFileName, null);
});

test('job card numbers increment across successive cards for the same tenant, independent of quote numbers', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const customerId = await makeCustomer(agent);

  await agent.post('/api/quotes').send({
    customerId,
    lineItems: [{ description: 'Part', unitPrice: 10, quantity: 1 }],
  });

  const first = await agent.post('/api/job-cards').send(repairPayload());
  const second = await agent.post('/api/job-cards').send(printPayload());

  assert.equal(first.body.jobCard.number, 'JC-0001');
  assert.equal(second.body.jobCard.number, 'JC-0002');
});

test('POST /api/job-cards rejects a print-typed request that includes a repair-only field', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);

  const res = await agent.post('/api/job-cards').send(printPayload({ equipmentMake: 'Prusa' }));
  assert.equal(res.status, 400);
});

test('POST /api/job-cards rejects a repair-typed request that includes a cad-only field', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);

  const res = await agent.post('/api/job-cards').send(repairPayload({ cadDesignType: 'nope' }));
  assert.equal(res.status, 400);
});

test('POST /api/job-cards rejects a cad-typed request that includes a print-only field', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);

  const res = await agent.post('/api/job-cards').send(cadPayload({ printQuantity: 3 }));
  assert.equal(res.status, 400);
});

test('POST /api/job-cards rejects an unknown customerId', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);

  const res = await agent.post('/api/job-cards').send(repairPayload({ customerId: 'does-not-exist' }));
  assert.equal(res.status, 400);
});

test('POST /api/job-cards rejects a missing jobTitle or receivedDate', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);

  const res = await agent.post('/api/job-cards').send({ cardType: 'repair' });
  assert.equal(res.status, 400);
});

test('GET /api/job-cards lists cards for the tenant', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  await agent.post('/api/job-cards').send(repairPayload());
  await agent.post('/api/job-cards').send(printPayload());

  const res = await agent.get('/api/job-cards');
  assert.equal(res.status, 200);
  assert.equal(res.body.jobCards.length, 2);
});

test('GET /api/job-cards/:id fetches a single card, 404s for a card belonging to another tenant', async () => {
  const app = buildApp();
  const agentA = await loggedInAgent(app, 'jc-a@example.co.za');
  const created = await agentA.post('/api/job-cards').send(repairPayload());
  const cardId = created.body.jobCard.id;

  const getOwn = await agentA.get(`/api/job-cards/${cardId}`);
  assert.equal(getOwn.status, 200);
  assert.equal(getOwn.body.jobCard.id, cardId);

  const agentB = await loggedInAgent(app, 'jc-b@example.co.za');
  const getOther = await agentB.get(`/api/job-cards/${cardId}`);
  assert.equal(getOther.status, 404);
});

test('PATCH /api/job-cards/:id updates fields within the same cardType', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const created = await agent.post('/api/job-cards').send(repairPayload());
  const cardId = created.body.jobCard.id;

  const res = await agent.patch(`/api/job-cards/${cardId}`).send({
    status: 'in_progress',
    reportedFault: 'Now grinding, not clicking',
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.jobCard.status, 'in_progress');
  assert.equal(res.body.jobCard.reportedFault, 'Now grinding, not clicking');
  assert.equal(res.body.jobCard.jobTitle, 'Fix extruder');
});

test('PATCH /api/job-cards/:id three-state-clears a nullable field with an explicit null', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const created = await agent.post('/api/job-cards').send(repairPayload());
  const cardId = created.body.jobCard.id;
  assert.equal(created.body.jobCard.reportedFault, 'Clicking noise');

  const res = await agent.patch(`/api/job-cards/${cardId}`).send({ reportedFault: null });
  assert.equal(res.status, 200);
  assert.equal(res.body.jobCard.reportedFault, null);
});

test('PATCH /api/job-cards/:id rejects an attempt to change cardType', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const created = await agent.post('/api/job-cards').send(repairPayload());
  const cardId = created.body.jobCard.id;

  const res = await agent.patch(`/api/job-cards/${cardId}`).send({ cardType: 'print' });
  assert.equal(res.status, 400);
});

test('PATCH /api/job-cards/:id rejects a field belonging to a different cardType than the card', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const created = await agent.post('/api/job-cards').send(repairPayload());
  const cardId = created.body.jobCard.id;

  const res = await agent.patch(`/api/job-cards/${cardId}`).send({ cadDesignType: 'Mechanical part' });
  assert.equal(res.status, 400);
});

test('PATCH /api/job-cards/:id 404s for a card belonging to another tenant', async () => {
  const app = buildApp();
  const agentA = await loggedInAgent(app, 'jc-patch-a@example.co.za');
  const created = await agentA.post('/api/job-cards').send(repairPayload());
  const cardId = created.body.jobCard.id;

  const agentB = await loggedInAgent(app, 'jc-patch-b@example.co.za');
  const res = await agentB.patch(`/api/job-cards/${cardId}`).send({ status: 'done' });
  assert.equal(res.status, 404);
});

test('POST /api/job-cards/:id/create-quote 400s when the card has no customer', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const created = await agent.post('/api/job-cards').send(repairPayload());
  const cardId = created.body.jobCard.id;

  const res = await agent.post(`/api/job-cards/${cardId}/create-quote`);
  assert.equal(res.status, 400);
});

test('POST /api/job-cards/:id/create-quote creates and links a quote, then 400s on a second attempt', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const customerId = await makeCustomer(agent);
  const created = await agent.post('/api/job-cards').send(repairPayload({ customerId }));
  const cardId = created.body.jobCard.id;

  const res = await agent.post(`/api/job-cards/${cardId}/create-quote`);
  assert.equal(res.status, 201);
  assert.equal(res.body.quote.customerId, customerId);
  assert.equal(res.body.quote.lineItems[0].description, 'Fix extruder');
  assert.equal(res.body.quote.lineItems[0].unitPrice, '0.00');
  assert.equal(res.body.quote.lineItems[0].quantity, 1);

  const cardAfter = await agent.get(`/api/job-cards/${cardId}`);
  assert.equal(cardAfter.body.jobCard.quoteId, res.body.quote.id);

  const second = await agent.post(`/api/job-cards/${cardId}/create-quote`);
  assert.equal(second.status, 400);
});

test('POST /api/job-cards/:id/create-quote 404s for a card belonging to another tenant', async () => {
  const app = buildApp();
  const agentA = await loggedInAgent(app, 'jc-quote-a@example.co.za');
  const customerId = await makeCustomer(agentA);
  const created = await agentA.post('/api/job-cards').send(repairPayload({ customerId }));
  const cardId = created.body.jobCard.id;

  const agentB = await loggedInAgent(app, 'jc-quote-b@example.co.za');
  const res = await agentB.post(`/api/job-cards/${cardId}/create-quote`);
  assert.equal(res.status, 404);
});

test('GET /api/job-cards/stats returns dueSoon, awaitingQuote, quoted, and invoiced against fixture data', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const customerId = await makeCustomer(agent);

  // Due soon: requiredBy within 3 days, not done/cancelled.
  await agent.post('/api/job-cards').send(
    repairPayload({ requiredBy: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString() }),
  );

  // Not due soon: requiredBy far in the future.
  await agent.post('/api/job-cards').send(
    printPayload({ requiredBy: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() }),
  );

  // Due soon by date, but excluded because it's done.
  const doneSoon = await agent.post('/api/job-cards').send(
    cadPayload({ requiredBy: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString() }),
  );
  await agent.patch(`/api/job-cards/${doneSoon.body.jobCard.id}`).send({ status: 'done' });

  // Quoted (and later invoiced).
  const quotedCard = await agent.post('/api/job-cards').send(repairPayload({ customerId }));
  const quoteRes = await agent.post(`/api/job-cards/${quotedCard.body.jobCard.id}/create-quote`);
  const quoteId = quoteRes.body.quote.id;
  await agent.patch(`/api/quotes/${quoteId}/status`).send({ status: 'sent' });
  await agent.patch(`/api/quotes/${quoteId}/status`).send({ status: 'accepted' });
  await agent.post(`/api/quotes/${quoteId}/convert-to-invoice`);

  // Quoted only, no invoice.
  const quotedOnlyCard = await agent.post('/api/job-cards').send(printPayload({ customerId }));
  await agent.post(`/api/job-cards/${quotedOnlyCard.body.jobCard.id}/create-quote`);

  const res = await agent.get('/api/job-cards/stats');
  assert.equal(res.status, 200);
  assert.equal(res.body.dueSoon, 1);
  assert.equal(res.body.awaitingQuote, 3);
  assert.equal(res.body.quoted, 2);
  assert.equal(res.body.invoiced, 1);
});

test('GET /api/job-cards/stats is tenant-isolated', async () => {
  const app = buildApp();
  const agentA = await loggedInAgent(app, 'jc-stats-a@example.co.za');
  await agentA.post('/api/job-cards').send(repairPayload());

  const agentB = await loggedInAgent(app, 'jc-stats-b@example.co.za');
  const res = await agentB.get('/api/job-cards/stats');
  assert.equal(res.status, 200);
  assert.equal(res.body.dueSoon, 0);
  assert.equal(res.body.awaitingQuote, 0);
  assert.equal(res.body.quoted, 0);
  assert.equal(res.body.invoiced, 0);
});
