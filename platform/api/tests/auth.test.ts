import { test, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildApp } from '../src/app.js';
import { resetTestDatabase } from './helpers/testApp.js';
import { prisma } from '../src/db/client.js';
import { mailer } from '../src/lib/mailer.js';

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
