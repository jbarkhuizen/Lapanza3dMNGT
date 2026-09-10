import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/db/client.js';
import { resetTestDatabase } from './helpers/testApp.js';

beforeEach(resetTestDatabase);

async function loggedInAgent(app: ReturnType<typeof buildApp>) {
  const email = 'jane@acmeprints.co.za';
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

test('unmatched route returns 404 with no session cookie', async () => {
  const app = buildApp();
  const res = await request(app).get('/api/does-not-exist');
  assert.equal(res.status, 404);
  assert.deepEqual(res.body, { ok: false, error: 'Not found.' });
});

test('unmatched route returns 404 even with a valid session cookie', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);

  const res = await agent.get('/api/does-not-exist');
  assert.equal(res.status, 404);
  assert.deepEqual(res.body, { ok: false, error: 'Not found.' });
});
