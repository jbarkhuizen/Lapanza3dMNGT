import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildApp } from '../src/app.js';
import { resetTestDatabase, loggedInAgent } from './helpers/testApp.js';
import { prisma } from '../src/db/client.js';

beforeEach(resetTestDatabase);

test('shop profile endpoints require auth', async () => {
  const app = buildApp();
  const res = await request(app).get('/api/shop-profile');
  assert.equal(res.status, 401);
});

test('GET /api/shop-profile returns defaults for a freshly registered tenant', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const res = await agent.get('/api/shop-profile');
  assert.equal(res.status, 200);
  assert.equal(res.body.shopProfile.shopSlug, null);
  assert.equal(res.body.shopProfile.shopIsPublished, false);
  assert.deepEqual(res.body.shopProfile.shopServices, []);
  assert.deepEqual(res.body.shopProfile.shopGalleryUrls, []);
  assert.equal(res.body.shopProfile.shopTagline, null);
  assert.equal(res.body.shopProfile.shopHoursText, null);
  assert.equal(res.body.shopProfile.shopContactWhatsapp, null);
});

test('PATCH /api/shop-profile updates fields and round-trips', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const res = await agent.patch('/api/shop-profile').send({
    shopSlug: 'acme-prints',
    shopTagline: 'Fast, affordable 3D printing',
    shopServices: ['Custom prints', 'Prototyping'],
    shopHoursText: 'Mon-Fri 9am-5pm',
    shopGalleryUrls: ['https://example.com/a.jpg', 'https://example.com/b.jpg'],
    shopContactWhatsapp: '+27821234567',
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.shopProfile.shopSlug, 'acme-prints');
  assert.equal(res.body.shopProfile.shopTagline, 'Fast, affordable 3D printing');
  assert.deepEqual(res.body.shopProfile.shopServices, ['Custom prints', 'Prototyping']);
  assert.equal(res.body.shopProfile.shopHoursText, 'Mon-Fri 9am-5pm');
  assert.deepEqual(res.body.shopProfile.shopGalleryUrls, ['https://example.com/a.jpg', 'https://example.com/b.jpg']);
  assert.equal(res.body.shopProfile.shopContactWhatsapp, '+27821234567');

  const getRes = await agent.get('/api/shop-profile');
  assert.equal(getRes.body.shopProfile.shopSlug, 'acme-prints');
  assert.deepEqual(getRes.body.shopProfile.shopServices, ['Custom prints', 'Prototyping']);
});

test('PATCH rejects publishing without a slug', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const res = await agent.patch('/api/shop-profile').send({ shopIsPublished: true });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'Set a URL slug before publishing your shop page.');
});

test('PATCH accepts publishing when a slug is supplied in the same request', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const res = await agent.patch('/api/shop-profile').send({ shopSlug: 'acme-prints', shopIsPublished: true });
  assert.equal(res.status, 200);
  assert.equal(res.body.shopProfile.shopIsPublished, true);
});

test('PATCH accepts publishing relying on a slug set in an earlier request', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  await agent.patch('/api/shop-profile').send({ shopSlug: 'acme-prints' });
  const res = await agent.patch('/api/shop-profile').send({ shopIsPublished: true });
  assert.equal(res.status, 200);
  assert.equal(res.body.shopProfile.shopIsPublished, true);
});

test('PATCH rejects a malformed slug', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);

  const uppercase = await agent.patch('/api/shop-profile').send({ shopSlug: 'Acme-Prints' });
  assert.equal(uppercase.status, 400);

  const doubleHyphen = await agent.patch('/api/shop-profile').send({ shopSlug: 'acme--prints' });
  assert.equal(doubleHyphen.status, 400);

  const leadingHyphen = await agent.patch('/api/shop-profile').send({ shopSlug: '-acme' });
  assert.equal(leadingHyphen.status, 400);

  const tooShort = await agent.patch('/api/shop-profile').send({ shopSlug: 'ab' });
  assert.equal(tooShort.status, 400);
});

test('PATCH returns 400 (not 500) on a duplicate slug across two tenants', async () => {
  const app = buildApp();
  const agentA = await loggedInAgent(app, 'a@acmeprints.co.za');
  const agentB = await loggedInAgent(app, 'b@otherprints.co.za');

  const first = await agentA.patch('/api/shop-profile').send({ shopSlug: 'acme-prints' });
  assert.equal(first.status, 200);

  const second = await agentB.patch('/api/shop-profile').send({ shopSlug: 'acme-prints' });
  assert.equal(second.status, 400);
  assert.equal(second.body.error, 'That URL is already taken — try a different one.');

  // Confirm the second tenant's row wasn't left in an inconsistent state.
  const tenantB = await prisma.tenant.findUnique({ where: { email: 'b@otherprints.co.za' } });
  assert.equal(tenantB?.shopSlug, null);
});
