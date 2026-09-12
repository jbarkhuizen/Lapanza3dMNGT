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
  assert.equal(res.body.shopProfile.shopAboutText, null);
  assert.equal(res.body.shopProfile.shopAvailability, null);
  assert.equal(res.body.shopProfile.shopGoogleReviewsUrl, null);
  assert.equal(res.body.shopProfile.shopTradingHours, null);
  assert.equal(res.body.shopProfile.shopFacebookUrl, null);
  assert.equal(res.body.shopProfile.shopInstagramUrl, null);
  assert.equal(res.body.shopProfile.shopTwitterUrl, null);
  assert.equal(res.body.shopProfile.shopTiktokUrl, null);
  assert.equal(res.body.shopProfile.shopYoutubeUrl, null);
  assert.equal(res.body.shopProfile.shopLinkedinUrl, null);
  assert.equal(res.body.shopProfile.shopDiscordUrl, null);
  assert.equal(res.body.shopProfile.shopCults3dUrl, null);
  assert.equal(res.body.shopProfile.shopPrintablesUrl, null);
  assert.equal(res.body.shopProfile.shopThingiverseUrl, null);
  assert.equal(res.body.shopProfile.shopMakerworldUrl, null);
  assert.equal(res.body.shopProfile.shopThangsUrl, null);
  assert.equal(res.body.shopProfile.shopCrealityCloudUrl, null);
  assert.equal(res.body.shopProfile.shopGrabcadUrl, null);
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

test('PATCH accepts and round-trips the new v2 fields (about, availability, reviews, trading hours, social/marketplace links)', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);

  const tradingHours = {
    monday: { open: true, start: '08:00', end: '17:00' },
    tuesday: { open: true, start: '08:00', end: '17:00' },
    wednesday: { open: true, start: '08:00', end: '17:00' },
    thursday: { open: true, start: '08:00', end: '17:00' },
    friday: { open: true, start: '08:00', end: '15:00' },
    saturday: { open: false, start: '09:00', end: '13:00' },
    sunday: { open: false, start: '09:00', end: '13:00' },
  };

  const res = await agent.patch('/api/shop-profile').send({
    shopAboutText: 'We are a small print farm specializing in functional prototypes.\n\nFounded in 2020.',
    shopAvailability: 'Currently accepting new orders',
    shopGoogleReviewsUrl: 'https://g.page/r/acme-prints/review',
    shopTradingHours: tradingHours,
    shopFacebookUrl: 'https://facebook.com/acmeprints',
    shopInstagramUrl: 'https://instagram.com/acmeprints',
    shopTwitterUrl: 'https://x.com/acmeprints',
    shopTiktokUrl: 'https://tiktok.com/@acmeprints',
    shopYoutubeUrl: 'https://youtube.com/@acmeprints',
    shopLinkedinUrl: 'https://linkedin.com/company/acmeprints',
    shopDiscordUrl: 'https://discord.gg/acmeprints',
    shopCults3dUrl: 'https://cults3d.com/en/users/acmeprints',
    shopPrintablesUrl: 'https://printables.com/@acmeprints',
    shopThingiverseUrl: 'https://thingiverse.com/acmeprints',
    shopMakerworldUrl: 'https://makerworld.com/@acmeprints',
    shopThangsUrl: 'https://thangs.com/designer/acmeprints',
    shopCrealityCloudUrl: 'https://crealitycloud.com/user/acmeprints',
    shopGrabcadUrl: 'https://grabcad.com/acmeprints',
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.shopProfile.shopAboutText, 'We are a small print farm specializing in functional prototypes.\n\nFounded in 2020.');
  assert.equal(res.body.shopProfile.shopAvailability, 'Currently accepting new orders');
  assert.equal(res.body.shopProfile.shopGoogleReviewsUrl, 'https://g.page/r/acme-prints/review');
  assert.deepEqual(res.body.shopProfile.shopTradingHours, tradingHours);
  assert.equal(res.body.shopProfile.shopFacebookUrl, 'https://facebook.com/acmeprints');
  assert.equal(res.body.shopProfile.shopInstagramUrl, 'https://instagram.com/acmeprints');
  assert.equal(res.body.shopProfile.shopTwitterUrl, 'https://x.com/acmeprints');
  assert.equal(res.body.shopProfile.shopTiktokUrl, 'https://tiktok.com/@acmeprints');
  assert.equal(res.body.shopProfile.shopYoutubeUrl, 'https://youtube.com/@acmeprints');
  assert.equal(res.body.shopProfile.shopLinkedinUrl, 'https://linkedin.com/company/acmeprints');
  assert.equal(res.body.shopProfile.shopDiscordUrl, 'https://discord.gg/acmeprints');
  assert.equal(res.body.shopProfile.shopCults3dUrl, 'https://cults3d.com/en/users/acmeprints');
  assert.equal(res.body.shopProfile.shopPrintablesUrl, 'https://printables.com/@acmeprints');
  assert.equal(res.body.shopProfile.shopThingiverseUrl, 'https://thingiverse.com/acmeprints');
  assert.equal(res.body.shopProfile.shopMakerworldUrl, 'https://makerworld.com/@acmeprints');
  assert.equal(res.body.shopProfile.shopThangsUrl, 'https://thangs.com/designer/acmeprints');
  assert.equal(res.body.shopProfile.shopCrealityCloudUrl, 'https://crealitycloud.com/user/acmeprints');
  assert.equal(res.body.shopProfile.shopGrabcadUrl, 'https://grabcad.com/acmeprints');

  const getRes = await agent.get('/api/shop-profile');
  assert.deepEqual(getRes.body.shopProfile.shopTradingHours, tradingHours);
  assert.equal(getRes.body.shopProfile.shopAboutText, 'We are a small print farm specializing in functional prototypes.\n\nFounded in 2020.');
});

test('PATCH rejects a shopTradingHours day missing the end field', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const res = await agent.patch('/api/shop-profile').send({
    shopTradingHours: { monday: { open: true, start: '08:00' } },
  });
  assert.equal(res.status, 400);
});

test('PATCH rejects a shopTradingHours object with an unknown day key', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const res = await agent.patch('/api/shop-profile').send({
    shopTradingHours: { funday: { open: true, start: '08:00', end: '17:00' } },
  });
  assert.equal(res.status, 400);
});

test('PATCH rejects a shopTradingHours day with a non-HH:MM time string', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const res = await agent.patch('/api/shop-profile').send({
    shopTradingHours: { monday: { open: true, start: '8am', end: '17:00' } },
  });
  assert.equal(res.status, 400);
});

test('PATCH rejects a malformed social/marketplace URL field', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);

  const badFacebook = await agent.patch('/api/shop-profile').send({ shopFacebookUrl: 'not-a-url' });
  assert.equal(badFacebook.status, 400);

  const badGoogleReviews = await agent.patch('/api/shop-profile').send({ shopGoogleReviewsUrl: 'not-a-url' });
  assert.equal(badGoogleReviews.status, 400);

  const badGrabcad = await agent.patch('/api/shop-profile').send({ shopGrabcadUrl: 'not-a-url' });
  assert.equal(badGrabcad.status, 400);
});

test('PATCH allows clearing a social/marketplace URL field back to blank', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  await agent.patch('/api/shop-profile').send({ shopFacebookUrl: 'https://facebook.com/acmeprints' });

  const res = await agent.patch('/api/shop-profile').send({ shopFacebookUrl: '' });
  assert.equal(res.status, 200);
  assert.equal(res.body.shopProfile.shopFacebookUrl, '');
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
