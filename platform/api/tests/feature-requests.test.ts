import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildApp } from '../src/app.js';
import { buildMinimalApp, loggedInAgent, resetTestDatabase } from './helpers/testApp.js';
import { featureRequestsRouter } from '../src/routes/feature-requests.js';
import { prisma } from '../src/db/client.js';

beforeEach(resetTestDatabase);

test('feature request endpoints require auth', async () => {
  const app = buildMinimalApp(featureRequestsRouter);
  const postRes = await request(app).post('/api/feature-requests').send({
    category: 'new_feature',
    title: 'Add dark mode',
    description: 'Please add a dark theme.',
  });
  assert.equal(postRes.status, 401);

  const mineRes = await request(app).get('/api/feature-requests/mine');
  assert.equal(mineRes.status, 401);

  const listRes = await request(app).get('/api/feature-requests');
  assert.equal(listRes.status, 401);

  const voteRes = await request(app).post('/api/feature-requests/does-not-exist/vote');
  assert.equal(voteRes.status, 401);
});

test('submitting a feature request makes it appear in GET /api/feature-requests/mine', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);

  const submitRes = await agent.post('/api/feature-requests').send({
    category: 'workflow',
    title: 'Bulk-update job status',
    description: 'Let me update several jobs at once.',
  });
  assert.equal(submitRes.status, 201);
  assert.equal(submitRes.body.featureRequest.title, 'Bulk-update job status');
  assert.equal(submitRes.body.featureRequest.status, 'new');

  const mineRes = await agent.get('/api/feature-requests/mine');
  assert.equal(mineRes.status, 200);
  assert.equal(mineRes.body.featureRequests.length, 1);
  assert.equal(mineRes.body.featureRequests[0].title, 'Bulk-update job status');
});

test('POST /api/feature-requests rejects an invalid category and blank title', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);

  const badCategoryRes = await agent.post('/api/feature-requests').send({
    category: 'not_a_real_category',
    title: 'Something',
    description: 'Something useful.',
  });
  assert.equal(badCategoryRes.status, 400);

  const blankTitleRes = await agent.post('/api/feature-requests').send({
    category: 'bug',
    title: '   ',
    description: 'Something useful.',
  });
  assert.equal(blankTitleRes.status, 400);
});

test('GET /api/feature-requests (community list) excludes tenantId from the response shape entirely', async () => {
  const app = buildApp();
  const agentA = await loggedInAgent(app, 'submitter@example.co.za');
  await agentA.post('/api/feature-requests').send({
    category: 'new_feature',
    title: 'Add CSV export',
    description: 'Export invoices as CSV.',
  });

  const agentB = await loggedInAgent(app, 'viewer@example.co.za');
  const listRes = await agentB.get('/api/feature-requests');
  assert.equal(listRes.status, 200);
  assert.equal(listRes.body.featureRequests.length, 1);

  const request0 = listRes.body.featureRequests[0];
  assert.equal(request0.title, 'Add CSV export');
  // The exact assertion the spec calls for: the key must be ABSENT, not just
  // unused by the frontend -- a leaked tenantId would still fail this even
  // if no UI ever rendered it.
  assert.equal('tenantId' in request0, false);
  assert.deepEqual(Object.keys(request0).sort(), [
    'category',
    'createdAt',
    'description',
    'hasVoted',
    'id',
    'status',
    'title',
    'voteCount',
  ]);
});

test('community list is visible across tenants (another tenant\'s submission shows up)', async () => {
  const app = buildApp();
  const agentA = await loggedInAgent(app, 'author@example.co.za');
  await agentA.post('/api/feature-requests').send({
    category: 'bug',
    title: 'Fix quote PDF margins',
    description: 'The margins are too tight on A4.',
  });

  const agentB = await loggedInAgent(app, 'other-tenant@example.co.za');
  const listRes = await agentB.get('/api/feature-requests');
  assert.equal(listRes.status, 200);
  assert.equal(listRes.body.featureRequests.length, 1);
  assert.equal(listRes.body.featureRequests[0].title, 'Fix quote PDF margins');

  // The submitting tenant does NOT see it under "mine" is wrong -- it's
  // theirs -- but the OTHER tenant should never see it under their "mine".
  const mineForOther = await agentB.get('/api/feature-requests/mine');
  assert.equal(mineForOther.body.featureRequests.length, 0);
});

test('voting toggles: vote -> unvote -> vote again, count tracks correctly', async () => {
  const app = buildApp();
  const submitter = await loggedInAgent(app, 'submitter2@example.co.za');
  const submitRes = await submitter.post('/api/feature-requests').send({
    category: 'new_feature',
    title: 'Add recurring invoices',
    description: 'Auto-generate monthly invoices.',
  });
  const id = submitRes.body.featureRequest.id;

  const voter = await loggedInAgent(app, 'voter@example.co.za');

  const firstVote = await voter.post(`/api/feature-requests/${id}/vote`);
  assert.equal(firstVote.status, 200);
  assert.equal(firstVote.body.hasVoted, true);
  assert.equal(firstVote.body.voteCount, 1);

  const secondVote = await voter.post(`/api/feature-requests/${id}/vote`);
  assert.equal(secondVote.status, 200);
  assert.equal(secondVote.body.hasVoted, false);
  assert.equal(secondVote.body.voteCount, 0);

  const thirdVote = await voter.post(`/api/feature-requests/${id}/vote`);
  assert.equal(thirdVote.status, 200);
  assert.equal(thirdVote.body.hasVoted, true);
  assert.equal(thirdVote.body.voteCount, 1);

  const listRes = await voter.get('/api/feature-requests');
  const entry = listRes.body.featureRequests.find((r: { id: string }) => r.id === id);
  assert.equal(entry.hasVoted, true);
  assert.equal(entry.voteCount, 1);
});

test('voting for a non-existent feature request returns 404', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const res = await agent.post('/api/feature-requests/does-not-exist/vote');
  assert.equal(res.status, 404);
});

test('a duplicate vote insert (simulating a race) is handled as "already voted", not a 500', async () => {
  const app = buildApp();
  const submitter = await loggedInAgent(app, 'submitter3@example.co.za');
  const submitRes = await submitter.post('/api/feature-requests').send({
    category: 'workflow',
    title: 'Kanban view for jobs',
    description: 'Drag jobs between status columns.',
  });
  const id = submitRes.body.featureRequest.id;

  const voter = await loggedInAgent(app, 'voter2@example.co.za');
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { email: 'voter2@example.co.za' } });

  // Simulate two concurrent requests racing to insert the same vote row by
  // creating the row directly (bypassing the route), then hitting the vote
  // endpoint — it must resolve this as "already voted" (toggling it off),
  // never a 500 from an unhandled unique-constraint violation.
  await prisma.featureRequestVote.create({ data: { featureRequestId: id, tenantId: tenant.id } });

  const res = await voter.post(`/api/feature-requests/${id}/vote`);
  assert.equal(res.status, 200);
  assert.equal(res.body.hasVoted, false);
  assert.equal(res.body.voteCount, 0);
});

test('sort=votes orders the community list by vote count descending', async () => {
  const app = buildApp();
  const submitter = await loggedInAgent(app, 'submitter4@example.co.za');

  const lowVotesRes = await submitter.post('/api/feature-requests').send({
    category: 'bug',
    title: 'Low votes request',
    description: 'Not very popular.',
  });
  const highVotesRes = await submitter.post('/api/feature-requests').send({
    category: 'new_feature',
    title: 'High votes request',
    description: 'Very popular.',
  });
  const lowId = lowVotesRes.body.featureRequest.id;
  const highId = highVotesRes.body.featureRequest.id;

  const voterA = await loggedInAgent(app, 'voterA@example.co.za');
  const voterB = await loggedInAgent(app, 'voterB@example.co.za');
  await voterA.post(`/api/feature-requests/${lowId}/vote`);
  await voterA.post(`/api/feature-requests/${highId}/vote`);
  await voterB.post(`/api/feature-requests/${highId}/vote`);

  const votesSortRes = await submitter.get('/api/feature-requests?sort=votes');
  assert.equal(votesSortRes.status, 200);
  const votesOrder = votesSortRes.body.featureRequests.map((r: { id: string }) => r.id);
  assert.deepEqual(votesOrder, [highId, lowId]);

  const recentSortRes = await submitter.get('/api/feature-requests?sort=recent');
  assert.equal(recentSortRes.status, 200);
  const recentOrder = recentSortRes.body.featureRequests.map((r: { id: string }) => r.id);
  assert.deepEqual(recentOrder, [highId, lowId]);
});
