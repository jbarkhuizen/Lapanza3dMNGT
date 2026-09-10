import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildApp } from '../src/app.js';
import { resetTestDatabase } from './helpers/testApp.js';
import { prisma } from '../src/db/client.js';

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

  const plan = await prisma.plan.findFirstOrThrow({ where: { name: 'Tier 1' } });
  await prisma.subscription.create({
    data: {
      tenantId: tenant!.id,
      planId: plan.id,
      status: 'active',
      paymentProvider: 'payfast',
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
  });

  return agent;
}

test('company profile endpoints require auth', async () => {
  const app = buildApp();
  const res = await request(app).get('/api/company-profile');
  assert.equal(res.status, 401);
});

test('GET /api/company-profile returns defaults for a freshly registered tenant, never the password hash', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const res = await agent.get('/api/company-profile');
  assert.equal(res.status, 200);
  assert.equal(res.body.companyProfile.businessName, 'Acme Prints');
  assert.equal(res.body.companyProfile.vatRegistered, false);
  assert.equal(res.body.companyProfile.defaultCurrency, 'ZAR');
  assert.equal(res.body.companyProfile.quoteNumberPrefix, 'QT');
  assert.equal(res.body.companyProfile.invoiceNumberPrefix, 'INV');
  assert.equal('passwordHash' in res.body.companyProfile, false);
});

test('PATCH /api/company-profile updates fields', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const res = await agent.patch('/api/company-profile').send({
    registrationNumber: '2024/123456/07',
    addressLine1: '1 Industria Rd',
    city: 'Cape Town',
    bankName: 'FNB',
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.companyProfile.registrationNumber, '2024/123456/07');
  assert.equal(res.body.companyProfile.city, 'Cape Town');
});

test('a lapsed subscription blocks PATCH /api/company-profile with 402', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);

  const tenant = await prisma.tenant.findUnique({ where: { email: 'jane@acmeprints.co.za' } });
  await prisma.subscription.update({
    where: { tenantId: tenant!.id },
    data: { status: 'lapsed' },
  });

  const res = await agent.patch('/api/company-profile').send({ city: 'Cape Town' });
  assert.equal(res.status, 402);
});

test('PATCH trims a whitespace-only quoteNumberPrefix down to blank (clearing it)', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const res = await agent.patch('/api/company-profile').send({ quoteNumberPrefix: '   ' });
  assert.equal(res.status, 200);
  assert.equal(res.body.companyProfile.quoteNumberPrefix, '');
});

test('PATCH can clear an already-set vatNumber back to blank when vatRegistered is false', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  await agent.patch('/api/company-profile').send({ vatNumber: '4123456789' });

  const res = await agent.patch('/api/company-profile').send({ vatNumber: '' });
  assert.equal(res.status, 200);
  assert.equal(res.body.companyProfile.vatNumber, '');
});

test('PATCH rejects clearing vatNumber to blank while vatRegistered is true in the same request', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  await agent.patch('/api/company-profile').send({ vatRegistered: true, vatNumber: '4123456789' });

  const res = await agent.patch('/api/company-profile').send({ vatRegistered: true, vatNumber: '' });
  assert.equal(res.status, 400);
});

test('PATCH can clear quoteNumberPrefix and invoiceNumberPrefix back to blank', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const res = await agent
    .patch('/api/company-profile')
    .send({ quoteNumberPrefix: '', invoiceNumberPrefix: '' });
  assert.equal(res.status, 200);
  assert.equal(res.body.companyProfile.quoteNumberPrefix, '');
  assert.equal(res.body.companyProfile.invoiceNumberPrefix, '');
});

test('PATCH rejects vatRegistered: true without a vatNumber, on a tenant that has never set one', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const res = await agent.patch('/api/company-profile').send({ vatRegistered: true });
  assert.equal(res.status, 400);
});

test('PATCH accepts vatRegistered: true when vatNumber is supplied in the same request', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const res = await agent.patch('/api/company-profile').send({ vatRegistered: true, vatNumber: '4123456789' });
  assert.equal(res.status, 200);
  assert.equal(res.body.companyProfile.vatRegistered, true);
});

test('PATCH accepts vatRegistered: true relying on a vatNumber set in an earlier request', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  await agent.patch('/api/company-profile').send({ vatNumber: '4123456789' });
  const res = await agent.patch('/api/company-profile').send({ vatRegistered: true });
  assert.equal(res.status, 200);
  assert.equal(res.body.companyProfile.vatRegistered, true);
});
