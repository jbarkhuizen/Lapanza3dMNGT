import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildApp } from '../src/app.js';
import { resetTestDatabase, loggedInAgent } from './helpers/testApp.js';
import { prisma } from '../src/db/client.js';

beforeEach(resetTestDatabase);

async function inviteTeamMember(
  app: ReturnType<typeof buildApp>,
  ownerAgent: ReturnType<typeof request.agent>,
  overrides: Partial<{ name: string; email: string; role: string }> = {},
) {
  const payload = { name: 'Sam Sales', email: 'sam@acmeprints.co.za', role: 'sales', ...overrides };
  return ownerAgent.post('/api/team/invite').send(payload);
}

async function setPasswordAndLogin(app: ReturnType<typeof buildApp>, email: string, password: string) {
  const member = await prisma.teamMember.findUnique({ where: { email } });
  const setPasswordRes = await request(app)
    .post('/api/team/set-password')
    .send({ token: member?.setPasswordToken, password });
  const agent = request.agent(app);
  const loginRes = await agent.post('/api/auth/login').send({ email, password });
  return { setPasswordRes, loginRes, agent };
}

test('POST /api/team/invite creates a team member and it shows up in GET /api/team', async () => {
  const app = buildApp();
  const ownerAgent = await loggedInAgent(app);

  const inviteRes = await inviteTeamMember(app, ownerAgent);
  assert.equal(inviteRes.status, 201);
  assert.equal(inviteRes.body.ok, true);
  assert.equal(inviteRes.body.teamMember.email, 'sam@acmeprints.co.za');
  assert.equal(inviteRes.body.teamMember.hasSetPassword, false);

  const listRes = await ownerAgent.get('/api/team');
  assert.equal(listRes.status, 200);
  assert.equal(listRes.body.teamMembers.length, 1);
  assert.equal(listRes.body.teamMembers[0].email, 'sam@acmeprints.co.za');
  assert.equal(listRes.body.teamMembers[0].role, 'sales');
});

test('POST /api/team/invite enforces the 3-active-member cap', async () => {
  const app = buildApp();
  const ownerAgent = await loggedInAgent(app);

  for (let i = 0; i < 3; i++) {
    const res = await inviteTeamMember(app, ownerAgent, { email: `member${i}@acmeprints.co.za` });
    assert.equal(res.status, 201, `invite ${i} should succeed`);
  }

  const fourthRes = await inviteTeamMember(app, ownerAgent, { email: 'member4@acmeprints.co.za' });
  assert.equal(fourthRes.status, 400);
  assert.equal(fourthRes.body.ok, false);

  const listRes = await ownerAgent.get('/api/team');
  assert.equal(listRes.body.teamMembers.length, 3);
});

test('a deactivated member no longer counts toward the 3-active cap, freeing a seat', async () => {
  const app = buildApp();
  const ownerAgent = await loggedInAgent(app);

  for (let i = 0; i < 3; i++) {
    await inviteTeamMember(app, ownerAgent, { email: `member${i}@acmeprints.co.za` });
  }
  const listRes = await ownerAgent.get('/api/team');
  const toDeactivate = listRes.body.teamMembers[0];

  const patchRes = await ownerAgent.patch(`/api/team/${toDeactivate.id}`).send({ active: false });
  assert.equal(patchRes.status, 200);

  const freshInviteRes = await inviteTeamMember(app, ownerAgent, { email: 'fresh@acmeprints.co.za' });
  assert.equal(freshInviteRes.status, 201);
});

test('POST /api/team/set-password activates the account and lets the member log in', async () => {
  const app = buildApp();
  const ownerAgent = await loggedInAgent(app);
  await inviteTeamMember(app, ownerAgent);

  const { setPasswordRes, loginRes } = await setPasswordAndLogin(app, 'sam@acmeprints.co.za', 'brand new password');
  assert.equal(setPasswordRes.status, 200);
  assert.equal(setPasswordRes.body.ok, true);
  assert.equal(loginRes.status, 200);
  assert.equal(loginRes.body.ok, true);
});

test('POST /api/team/set-password rejects an unknown token', async () => {
  const app = buildApp();
  const res = await request(app).post('/api/team/set-password').send({ token: 'not-a-real-token', password: 'brand new password' });
  assert.equal(res.status, 400);
  assert.equal(res.body.ok, false);
});

test('POST /api/team/set-password rejects an expired token', async () => {
  const app = buildApp();
  const ownerAgent = await loggedInAgent(app);
  await inviteTeamMember(app, ownerAgent);

  const member = await prisma.teamMember.findUnique({ where: { email: 'sam@acmeprints.co.za' } });
  await prisma.teamMember.update({
    where: { id: member!.id },
    data: { setPasswordTokenExpires: new Date(Date.now() - 60 * 60 * 1000) },
  });

  const res = await request(app)
    .post('/api/team/set-password')
    .send({ token: member!.setPasswordToken, password: 'brand new password' });
  assert.equal(res.status, 400);
  assert.equal(res.body.ok, false);
});

test('DELETE /api/team/:id hard-deletes the member and they no longer appear in GET /api/team', async () => {
  const app = buildApp();
  const ownerAgent = await loggedInAgent(app);
  await inviteTeamMember(app, ownerAgent);
  const listRes = await ownerAgent.get('/api/team');
  const memberId = listRes.body.teamMembers[0].id;

  const deleteRes = await ownerAgent.delete(`/api/team/${memberId}`);
  assert.equal(deleteRes.status, 200);
  assert.equal(deleteRes.body.ok, true);

  const afterListRes = await ownerAgent.get('/api/team');
  assert.equal(afterListRes.body.teamMembers.length, 0);
});

test('DELETE /api/team/:id returns 404 for a member belonging to a different tenant', async () => {
  const app = buildApp();
  const ownerAgentA = await loggedInAgent(app, 'ownerA@acmeprints.co.za');
  const ownerAgentB = await loggedInAgent(app, 'ownerB@acmeprints.co.za');

  await inviteTeamMember(app, ownerAgentA);
  const listRes = await ownerAgentA.get('/api/team');
  const memberId = listRes.body.teamMembers[0].id;

  const deleteRes = await ownerAgentB.delete(`/api/team/${memberId}`);
  assert.equal(deleteRes.status, 404);

  const stillThereRes = await ownerAgentA.get('/api/team');
  assert.equal(stillThereRes.body.teamMembers.length, 1);
});

test('a sales-role session gets 403 from company-profile/billing/team but 200 from customers/quotes', async () => {
  const app = buildApp();
  const ownerAgent = await loggedInAgent(app);
  await inviteTeamMember(app, ownerAgent, { role: 'sales' });
  const { agent: salesAgent } = await setPasswordAndLogin(app, 'sam@acmeprints.co.za', 'brand new password');

  const companyProfileRes = await salesAgent.get('/api/company-profile');
  assert.equal(companyProfileRes.status, 403);
  assert.equal(companyProfileRes.body.error, 'Only an account admin can do this.');

  const billingRes = await salesAgent.get('/api/billing/subscription');
  assert.equal(billingRes.status, 403);

  const teamRes = await salesAgent.get('/api/team');
  assert.equal(teamRes.status, 403);

  const shopProfileRes = await salesAgent.get('/api/shop-profile');
  assert.equal(shopProfileRes.status, 403);

  const reportsRes = await salesAgent.get('/api/reports/summary');
  assert.equal(reportsRes.status, 403);

  const dashboardRes = await salesAgent.get('/api/reports/dashboard');
  assert.equal(dashboardRes.status, 403);

  const customersRes = await salesAgent.get('/api/customers');
  assert.equal(customersRes.status, 200);
  assert.equal(customersRes.body.ok, true);

  const quotesRes = await salesAgent.get('/api/quotes');
  assert.equal(quotesRes.status, 200);
  assert.equal(quotesRes.body.ok, true);
});

test('an admin-role team member (not just the owner) also passes requireAdminRole', async () => {
  const app = buildApp();
  const ownerAgent = await loggedInAgent(app);
  await inviteTeamMember(app, ownerAgent, { role: 'admin', email: 'alex@acmeprints.co.za' });
  const { agent: adminMemberAgent } = await setPasswordAndLogin(app, 'alex@acmeprints.co.za', 'brand new password');

  const teamRes = await adminMemberAgent.get('/api/team');
  assert.equal(teamRes.status, 200);
  assert.equal(teamRes.body.ok, true);

  const companyProfileRes = await adminMemberAgent.get('/api/company-profile');
  assert.equal(companyProfileRes.status, 200);
});

test('PATCH /api/team/:id can change a member\'s role', async () => {
  const app = buildApp();
  const ownerAgent = await loggedInAgent(app);
  await inviteTeamMember(app, ownerAgent, { role: 'sales' });
  const listRes = await ownerAgent.get('/api/team');
  const memberId = listRes.body.teamMembers[0].id;

  const patchRes = await ownerAgent.patch(`/api/team/${memberId}`).send({ role: 'admin' });
  assert.equal(patchRes.status, 200);

  const afterListRes = await ownerAgent.get('/api/team');
  assert.equal(afterListRes.body.teamMembers[0].role, 'admin');
});

test('PATCH /api/team/:id returns 404 for a member belonging to a different tenant', async () => {
  const app = buildApp();
  const ownerAgentA = await loggedInAgent(app, 'ownerA@acmeprints.co.za');
  const ownerAgentB = await loggedInAgent(app, 'ownerB@acmeprints.co.za');
  await inviteTeamMember(app, ownerAgentA);
  const listRes = await ownerAgentA.get('/api/team');
  const memberId = listRes.body.teamMembers[0].id;

  const patchRes = await ownerAgentB.patch(`/api/team/${memberId}`).send({ active: false });
  assert.equal(patchRes.status, 404);
});

test('POST /api/team/invite rejects an email that collides with an existing tenant', async () => {
  const app = buildApp();
  await request(app).post('/api/auth/register').send({
    businessName: 'Other Co',
    contactName: 'Other Person',
    email: 'collide@example.co.za',
    password: 'correct horse battery staple',
  });
  const ownerAgent = await loggedInAgent(app);

  const res = await inviteTeamMember(app, ownerAgent, { email: 'collide@example.co.za' });
  assert.equal(res.status, 409);
  assert.equal(res.body.ok, false);
});
