import { test, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildApp } from '../src/app.js';
import { resetTestDatabase } from './helpers/testApp.js';
import { prisma } from '../src/db/client.js';
import { mailer } from '../src/lib/mailer.js';
import { hashPassword } from '../src/auth/password.js';

beforeEach(resetTestDatabase);

test('POST /api/auth/register creates an unverified tenant', async () => {
  const app = buildApp();
  const res = await request(app).post('/api/auth/register').send({
    businessName: 'Acme Prints',
    contactName: 'Jane Doe',
    email: 'jane@acmeprints.co.za',
    password: 'correct horse battery staple',
  });

  assert.equal(res.status, 201);
  assert.equal(res.body.ok, true);

  const tenant = await prisma.tenant.findUnique({
    where: { email: 'jane@acmeprints.co.za' },
  });
  assert.ok(tenant, 'tenant row should exist');
  assert.equal(tenant?.emailVerifiedAt, null);
  assert.notEqual(tenant?.passwordHash, 'correct horse battery staple');
});

test('POST /api/auth/register rejects a duplicate email', async () => {
  const app = buildApp();
  const payload = {
    businessName: 'Acme Prints',
    contactName: 'Jane Doe',
    email: 'jane@acmeprints.co.za',
    password: 'correct horse battery staple',
  };
  await request(app).post('/api/auth/register').send(payload);
  const res = await request(app).post('/api/auth/register').send(payload);

  assert.equal(res.status, 409);
  assert.equal(res.body.ok, false);
});

test('POST /api/auth/register handles a concurrent duplicate registration race', async () => {
  const app = buildApp();
  const payload = {
    businessName: 'Acme Prints',
    contactName: 'Jane Doe',
    email: 'race@acmeprints.co.za',
    password: 'correct horse battery staple',
  };

  const [first, second] = await Promise.all([
    request(app).post('/api/auth/register').send(payload),
    request(app).post('/api/auth/register').send(payload),
  ]);

  const statuses = [first.status, second.status].sort();
  assert.deepEqual(statuses, [201, 409]);

  const winner = first.status === 201 ? first : second;
  const loser = first.status === 201 ? second : first;
  assert.equal(winner.body.ok, true);
  assert.equal(loser.body.ok, false);
  assert.equal(loser.body.error, 'An account with this email already exists.');
});

test('POST /api/auth/register rejects a missing required field', async () => {
  const app = buildApp();
  const res = await request(app).post('/api/auth/register').send({
    businessName: 'Acme Prints',
    email: 'jane@acmeprints.co.za',
    password: 'correct horse battery staple',
  });

  assert.equal(res.status, 400);
  assert.equal(res.body.ok, false);
});

test('POST /api/auth/verify-email verifies a valid token', async () => {
  const app = buildApp();
  await request(app).post('/api/auth/register').send({
    businessName: 'Acme Prints',
    contactName: 'Jane Doe',
    email: 'jane@acmeprints.co.za',
    password: 'correct horse battery staple',
  });
  const tenant = await prisma.tenant.findUnique({ where: { email: 'jane@acmeprints.co.za' } });

  const res = await request(app)
    .post('/api/auth/verify-email')
    .send({ token: tenant?.verificationToken });

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);

  const updated = await prisma.tenant.findUnique({ where: { email: 'jane@acmeprints.co.za' } });
  assert.ok(updated?.emailVerifiedAt, 'emailVerifiedAt should be set');
});

test('POST /api/auth/verify-email rejects an unknown token', async () => {
  const app = buildApp();
  const res = await request(app)
    .post('/api/auth/verify-email')
    .send({ token: 'not-a-real-token' });

  assert.equal(res.status, 400);
  assert.equal(res.body.ok, false);
});

test('POST /api/auth/resend-verification returns 404 for an unknown email', async () => {
  const app = buildApp();
  const res = await request(app)
    .post('/api/auth/resend-verification')
    .send({ email: 'nobody@example.com' });

  assert.equal(res.status, 404);
  assert.equal(res.body.ok, false);
  assert.match(res.body.error, /No account found/);
});

test('POST /api/auth/resend-verification returns 400 for an invalid email format', async () => {
  const app = buildApp();
  const res = await request(app)
    .post('/api/auth/resend-verification')
    .send({ email: 'not-an-email' });

  assert.equal(res.status, 400);
  assert.equal(res.body.ok, false);
});

async function registerAndVerify(app: ReturnType<typeof buildApp>, email: string) {
  await request(app).post('/api/auth/register').send({
    businessName: 'Acme Prints',
    contactName: 'Jane Doe',
    email,
    password: 'correct horse battery staple',
  });
  const tenant = await prisma.tenant.findUnique({ where: { email } });
  await request(app).post('/api/auth/verify-email').send({ token: tenant?.verificationToken });
}

test('POST /api/auth/resend-verification returns 400 for an already-verified account', async () => {
  const app = buildApp();
  await registerAndVerify(app, 'jane@acmeprints.co.za');

  const res = await request(app)
    .post('/api/auth/resend-verification')
    .send({ email: 'jane@acmeprints.co.za' });

  assert.equal(res.status, 400);
  assert.equal(res.body.ok, false);
  assert.match(res.body.error, /already verified/);
});

test('POST /api/auth/resend-verification mints a fresh token that invalidates the old one', async () => {
  const app = buildApp();
  await request(app).post('/api/auth/register').send({
    businessName: 'Acme Prints',
    contactName: 'Jane Doe',
    email: 'jane@acmeprints.co.za',
    password: 'correct horse battery staple',
  });
  const original = await prisma.tenant.findUnique({ where: { email: 'jane@acmeprints.co.za' } });
  const originalToken = original?.verificationToken;

  const res = await request(app)
    .post('/api/auth/resend-verification')
    .send({ email: 'jane@acmeprints.co.za' });

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);

  const updated = await prisma.tenant.findUnique({ where: { email: 'jane@acmeprints.co.za' } });
  assert.ok(updated?.verificationToken, 'a new token should be set');
  assert.notEqual(updated?.verificationToken, originalToken, 'the token should have changed');
  assert.ok(
    updated!.verificationTokenExpires!.getTime() > original!.verificationTokenExpires!.getTime(),
    'the expiry should have been refreshed to a later time',
  );

  // The old token must no longer verify the account.
  const oldTokenAttempt = await request(app)
    .post('/api/auth/verify-email')
    .send({ token: originalToken });
  assert.equal(oldTokenAttempt.status, 400);

  // The new token must work.
  const newTokenAttempt = await request(app)
    .post('/api/auth/verify-email')
    .send({ token: updated?.verificationToken });
  assert.equal(newTokenAttempt.status, 200);
});

test('POST /api/auth/resend-verification genuinely fixes a truly-expired verification window', async () => {
  const app = buildApp();
  await request(app).post('/api/auth/register').send({
    businessName: 'Acme Prints',
    contactName: 'Jane Doe',
    email: 'jane@acmeprints.co.za',
    password: 'correct horse battery staple',
  });

  // Simulate a token whose expiry has genuinely lapsed (not just "about to").
  const pastExpiry = new Date(Date.now() - 60 * 60 * 1000);
  await prisma.tenant.update({
    where: { email: 'jane@acmeprints.co.za' },
    data: { verificationTokenExpires: pastExpiry },
  });

  // The now-expired token must be rejected, proving the scenario is real.
  const expired = await prisma.tenant.findUnique({ where: { email: 'jane@acmeprints.co.za' } });
  const expiredAttempt = await request(app)
    .post('/api/auth/verify-email')
    .send({ token: expired?.verificationToken });
  assert.equal(expiredAttempt.status, 400);

  const res = await request(app)
    .post('/api/auth/resend-verification')
    .send({ email: 'jane@acmeprints.co.za' });
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);

  const updated = await prisma.tenant.findUnique({ where: { email: 'jane@acmeprints.co.za' } });
  assert.notEqual(updated?.verificationToken, expired?.verificationToken, 'a new token should have been minted');

  // The new token, issued after resend, must actually verify the account.
  const newTokenAttempt = await request(app)
    .post('/api/auth/verify-email')
    .send({ token: updated?.verificationToken });
  assert.equal(newTokenAttempt.status, 200);
  assert.equal(newTokenAttempt.body.ok, true);

  const verified = await prisma.tenant.findUnique({ where: { email: 'jane@acmeprints.co.za' } });
  assert.ok(verified?.emailVerifiedAt, 'emailVerifiedAt should be set after verifying with the resent token');
});

test('POST /api/auth/login sets a session cookie for correct credentials', async () => {
  const app = buildApp();
  await registerAndVerify(app, 'jane@acmeprints.co.za');

  const res = await request(app).post('/api/auth/login').send({
    email: 'jane@acmeprints.co.za',
    password: 'correct horse battery staple',
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  const setCookie = res.headers['set-cookie']?.[0] ?? '';
  assert.match(setCookie, /barkie_session=/);
  assert.match(setCookie, /HttpOnly/);
});

test('POST /api/auth/login rejects the wrong password', async () => {
  const app = buildApp();
  await registerAndVerify(app, 'jane@acmeprints.co.za');

  const res = await request(app).post('/api/auth/login').send({
    email: 'jane@acmeprints.co.za',
    password: 'wrong password entirely',
  });

  assert.equal(res.status, 401);
  assert.equal(res.body.ok, false);
});

test('POST /api/auth/login runs a real password comparison for both an unknown email and a known email with the wrong password', async () => {
  // Backlog #9: an unknown email used to skip the bcrypt compare entirely
  // (fast path), while a known email with a wrong password always ran one
  // (slow path) — a timing side-channel that let an attacker enumerate
  // registered emails by response latency. Both paths must now run exactly
  // one real comparison, proving the two cases do the same amount of work.
  const app = buildApp();
  await registerAndVerify(app, 'jane@acmeprints.co.za');
  const bcrypt = (await import('bcryptjs')).default;

  try {
    const unknownEmailSpy = mock.method(bcrypt, 'compare');
    const unknownRes = await request(app).post('/api/auth/login').send({
      email: 'nobody@acmeprints.co.za',
      password: 'whatever password',
    });
    assert.equal(unknownRes.status, 401);
    assert.equal(unknownEmailSpy.mock.calls.length, 1, 'an unknown email should still run one real bcrypt compare');

    const wrongPasswordSpy = mock.method(bcrypt, 'compare');
    const wrongPasswordRes = await request(app).post('/api/auth/login').send({
      email: 'jane@acmeprints.co.za',
      password: 'wrong password entirely',
    });
    assert.equal(wrongPasswordRes.status, 401);
    assert.equal(wrongPasswordSpy.mock.calls.length, 1, 'a known email with the wrong password should run exactly one real bcrypt compare');
  } finally {
    mock.restoreAll();
  }
});

test('GET /api/auth/me returns the tenant when logged in, 401 otherwise', async () => {
  const app = buildApp();
  await registerAndVerify(app, 'jane@acmeprints.co.za');
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({
    email: 'jane@acmeprints.co.za',
    password: 'correct horse battery staple',
  });

  const authed = await agent.get('/api/auth/me');
  assert.equal(authed.status, 200);
  assert.equal(authed.body.tenant.email, 'jane@acmeprints.co.za');

  const anonymous = await request(app).get('/api/auth/me');
  assert.equal(anonymous.status, 401);
});

test('GET /api/auth/me reports hasSubscription: false for a tenant with no subscription yet', async () => {
  const app = buildApp();
  await registerAndVerify(app, 'jane@acmeprints.co.za');
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({
    email: 'jane@acmeprints.co.za',
    password: 'correct horse battery staple',
  });

  const res = await agent.get('/api/auth/me');
  assert.equal(res.status, 200);
  assert.equal(res.body.tenant.hasSubscription, false);
});

test('POST /api/auth/logout clears the session', async () => {
  const app = buildApp();
  await registerAndVerify(app, 'jane@acmeprints.co.za');
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({
    email: 'jane@acmeprints.co.za',
    password: 'correct horse battery staple',
  });

  await agent.post('/api/auth/logout');
  const res = await agent.get('/api/auth/me');
  assert.equal(res.status, 401);
});

test('POST /api/auth/login rejects an unverified tenant', async () => {
  const app = buildApp();
  await request(app).post('/api/auth/register').send({
    businessName: 'Acme Prints',
    contactName: 'Jane Doe',
    email: 'jane@acmeprints.co.za',
    password: 'correct horse battery staple',
  });

  const res = await request(app).post('/api/auth/login').send({
    email: 'jane@acmeprints.co.za',
    password: 'correct horse battery staple',
  });

  assert.equal(res.status, 403);
  assert.equal(res.body.ok, false);
  assert.equal(res.body.error, 'Verify your email address before logging in.');
});

test('POST /api/auth/login is rate-limited after repeated failures', async () => {
  const app = buildApp();
  await registerAndVerify(app, 'jane@acmeprints.co.za');

  let lastStatus = 0;
  for (let i = 0; i < 12; i++) {
    const res = await request(app).post('/api/auth/login').send({
      email: 'jane@acmeprints.co.za',
      password: 'wrong password entirely',
    });
    lastStatus = res.status;
  }

  assert.equal(lastStatus, 429);
});

test('POST /api/auth/register still returns 201 with a tenant row if the verification email send throws', async () => {
  mock.method(mailer, 'isConfigured', () => true);
  mock.method(mailer, 'sendMail', async () => {
    throw new Error('SMTP temporarily unavailable');
  });

  try {
    const app = buildApp();
    const res = await request(app).post('/api/auth/register').send({
      businessName: 'Acme Prints',
      contactName: 'Jane Doe',
      email: 'jane@acmeprints.co.za',
      password: 'correct horse battery staple',
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.ok, true);

    const tenant = await prisma.tenant.findUnique({ where: { email: 'jane@acmeprints.co.za' } });
    assert.ok(tenant, 'tenant row should still exist despite the email failure');
  } finally {
    mock.restoreAll();
  }
});

test('sendVerificationEmail sends real mail with the verification link when SMTP is configured', async () => {
  const { sendVerificationEmail } = await import('../src/auth/email.js');
  mock.method(mailer, 'isConfigured', () => true);
  const sendMailCalls: Array<Record<string, unknown>> = [];
  mock.method(mailer, 'sendMail', async (opts: Record<string, unknown>) => {
    sendMailCalls.push(opts);
  });

  try {
    await sendVerificationEmail('bob@example.com', 'abc123token');

    assert.equal(sendMailCalls.length, 1);
    assert.equal(sendMailCalls[0].to, 'bob@example.com');
    assert.match(sendMailCalls[0].text as string, /abc123token/);
  } finally {
    mock.restoreAll();
  }
});

test('login rate limit is independent from the register/resend-verification bucket', async () => {
  const app = buildApp();
  const email = 'jane@acmeprints.co.za';
  for (let i = 0; i < 10; i++) {
    await request(app).post('/api/auth/login').send({ email, password: 'wrong' });
  }
  const limitedLogin = await request(app).post('/api/auth/login').send({ email, password: 'wrong' });
  assert.equal(limitedLogin.status, 429);

  const registerRes = await request(app).post('/api/auth/register').send({
    businessName: 'Acme Prints',
    contactName: 'Jane Doe',
    email,
    password: 'correct horse battery staple',
  });
  assert.notEqual(registerRes.status, 429);
});

test('team-member login succeeds and the resulting session carries the correct role via requireTenantAuth', async () => {
  const app = buildApp();
  await registerAndVerify(app, 'owner@acmeprints.co.za');
  const tenant = await prisma.tenant.findUnique({ where: { email: 'owner@acmeprints.co.za' } });

  await prisma.teamMember.create({
    data: {
      tenantId: tenant!.id,
      name: 'Sam Sales',
      email: 'sam@acmeprints.co.za',
      role: 'sales',
      active: true,
      passwordHash: await hashPassword('correct horse battery staple'),
    },
  });

  const agent = request.agent(app);
  const loginRes = await agent.post('/api/auth/login').send({
    email: 'sam@acmeprints.co.za',
    password: 'correct horse battery staple',
  });
  assert.equal(loginRes.status, 200);
  assert.equal(loginRes.body.ok, true);

  const me = await agent.get('/api/auth/me');
  assert.equal(me.status, 200);
  // The team member's session resolves req.tenantId to the OWNING tenant —
  // /api/auth/me reports that tenant's own info, plus the actor's own role
  // and identity distinct from it.
  assert.equal(me.body.tenant.id, tenant!.id);
  assert.equal(me.body.tenant.businessName, 'Acme Prints');
  assert.equal(me.body.actorRole, 'sales');
  assert.equal(me.body.actorName, 'Sam Sales');
  assert.equal(me.body.actorEmail, 'sam@acmeprints.co.za');
});

test('an admin-role team member session reports actorRole admin, distinct from the owner', async () => {
  const app = buildApp();
  await registerAndVerify(app, 'owner@acmeprints.co.za');
  const tenant = await prisma.tenant.findUnique({ where: { email: 'owner@acmeprints.co.za' } });

  await prisma.teamMember.create({
    data: {
      tenantId: tenant!.id,
      name: 'Alex Admin',
      email: 'alex@acmeprints.co.za',
      role: 'admin',
      active: true,
      passwordHash: await hashPassword('correct horse battery staple'),
    },
  });

  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({
    email: 'alex@acmeprints.co.za',
    password: 'correct horse battery staple',
  });

  const me = await agent.get('/api/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.body.actorRole, 'admin');
  assert.equal(me.body.actorName, 'Alex Admin');
});

test('a deactivated team member cannot log in even with the correct password', async () => {
  const app = buildApp();
  await registerAndVerify(app, 'owner@acmeprints.co.za');
  const tenant = await prisma.tenant.findUnique({ where: { email: 'owner@acmeprints.co.za' } });

  await prisma.teamMember.create({
    data: {
      tenantId: tenant!.id,
      name: 'Sam Sales',
      email: 'sam@acmeprints.co.za',
      role: 'sales',
      active: false,
      passwordHash: await hashPassword('correct horse battery staple'),
    },
  });

  const res = await request(app).post('/api/auth/login').send({
    email: 'sam@acmeprints.co.za',
    password: 'correct horse battery staple',
  });
  assert.equal(res.status, 401);
  assert.equal(res.body.ok, false);
});

test('an invited team member with no password set yet cannot log in', async () => {
  const app = buildApp();
  await registerAndVerify(app, 'owner@acmeprints.co.za');
  const tenant = await prisma.tenant.findUnique({ where: { email: 'owner@acmeprints.co.za' } });

  await prisma.teamMember.create({
    data: {
      tenantId: tenant!.id,
      name: 'Sam Sales',
      email: 'sam@acmeprints.co.za',
      role: 'sales',
      active: true,
      passwordHash: null,
      setPasswordToken: 'sometoken',
      setPasswordTokenExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

  const res = await request(app).post('/api/auth/login').send({
    email: 'sam@acmeprints.co.za',
    password: 'anything at all',
  });
  assert.equal(res.status, 401);
  assert.equal(res.body.ok, false);
});

test('a team member deactivated MID-SESSION is rejected on the very next request, not just at next login', async () => {
  // This is the test that actually proves the security property described
  // in the design spec: requireTenantAuth re-checks `active` on every
  // request, not just at login — so revoking access takes effect
  // immediately, without waiting for the session to expire or the member
  // to log out.
  const app = buildApp();
  await registerAndVerify(app, 'owner@acmeprints.co.za');
  const tenant = await prisma.tenant.findUnique({ where: { email: 'owner@acmeprints.co.za' } });

  const member = await prisma.teamMember.create({
    data: {
      tenantId: tenant!.id,
      name: 'Sam Sales',
      email: 'sam@acmeprints.co.za',
      role: 'sales',
      active: true,
      passwordHash: await hashPassword('correct horse battery staple'),
    },
  });

  const agent = request.agent(app);
  const loginRes = await agent.post('/api/auth/login').send({
    email: 'sam@acmeprints.co.za',
    password: 'correct horse battery staple',
  });
  assert.equal(loginRes.status, 200);

  // The session is genuinely valid at this point.
  const meBefore = await agent.get('/api/auth/me');
  assert.equal(meBefore.status, 200);

  // Deactivate directly at the DB layer (simulating an admin's
  // PATCH /api/team/:id call) WITHOUT touching the existing session token.
  await prisma.teamMember.update({ where: { id: member.id }, data: { active: false } });

  const meAfter = await agent.get('/api/auth/me');
  assert.equal(meAfter.status, 401, 'the still-valid session token must now be rejected');
});

test('POST /api/auth/login runs exactly one real bcrypt comparison across all three login outcomes (unknown email, wrong tenant password, wrong team-member password)', async () => {
  // Extends the backlog #9 timing-safety property to the new three-way
  // lookup (tenant -> team member -> dummy hash) — every outcome must run
  // exactly one real comparison, so none of them is distinguishable from
  // the others via response timing.
  const app = buildApp();
  await registerAndVerify(app, 'jane@acmeprints.co.za');
  const tenant = await prisma.tenant.findUnique({ where: { email: 'jane@acmeprints.co.za' } });
  await prisma.teamMember.create({
    data: {
      tenantId: tenant!.id,
      name: 'Sam Sales',
      email: 'sam@acmeprints.co.za',
      role: 'sales',
      active: true,
      passwordHash: await hashPassword('team member password'),
    },
  });
  const bcrypt = (await import('bcryptjs')).default;

  try {
    const unknownEmailSpy = mock.method(bcrypt, 'compare');
    const unknownRes = await request(app).post('/api/auth/login').send({
      email: 'nobody@acmeprints.co.za',
      password: 'whatever password',
    });
    assert.equal(unknownRes.status, 401);
    assert.equal(unknownEmailSpy.mock.calls.length, 1, 'an unknown email should run exactly one real bcrypt compare');
    mock.restoreAll();

    const wrongTenantPasswordSpy = mock.method(bcrypt, 'compare');
    const wrongTenantRes = await request(app).post('/api/auth/login').send({
      email: 'jane@acmeprints.co.za',
      password: 'wrong password entirely',
    });
    assert.equal(wrongTenantRes.status, 401);
    assert.equal(wrongTenantPasswordSpy.mock.calls.length, 1, 'a wrong tenant password should run exactly one real bcrypt compare');
    mock.restoreAll();

    const wrongTeamMemberPasswordSpy = mock.method(bcrypt, 'compare');
    const wrongTeamMemberRes = await request(app).post('/api/auth/login').send({
      email: 'sam@acmeprints.co.za',
      password: 'wrong password entirely',
    });
    assert.equal(wrongTeamMemberRes.status, 401);
    assert.equal(wrongTeamMemberPasswordSpy.mock.calls.length, 1, 'a wrong team-member password should run exactly one real bcrypt compare');
  } finally {
    mock.restoreAll();
  }
});

test('register and resend-verification share one rate-limit bucket', async () => {
  const app = buildApp();
  const payload = {
    businessName: 'Acme Prints',
    contactName: 'Jane Doe',
    email: 'jane@acmeprints.co.za',
    password: 'correct horse battery staple',
  };
  await request(app).post('/api/auth/register').send(payload);
  for (let i = 0; i < 9; i++) {
    await request(app).post('/api/auth/resend-verification').send({ email: payload.email });
  }
  const limited = await request(app).post('/api/auth/resend-verification').send({ email: payload.email });
  assert.equal(limited.status, 429);
});
