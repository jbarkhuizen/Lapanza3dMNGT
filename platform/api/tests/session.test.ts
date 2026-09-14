import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/db/client.js';
import { createSession, destroySession, getSession } from '../src/auth/session.js';
import { resetTestDatabase } from './helpers/testApp.js';

beforeEach(resetTestDatabase);

test('getSession deletes an expired session row instead of just rejecting it', async () => {
  const { token } = await createSession('tenant', 'fake-tenant-id');
  await prisma.session.update({ where: { token }, data: { expiresAt: new Date(Date.now() - 1000) } });

  const result = await getSession(token);
  assert.equal(result, null);

  const row = await prisma.session.findUnique({ where: { token } });
  assert.equal(row, null, 'the expired session row should have been deleted');
});

test('getSession returns the subject for a still-valid session and leaves it in place', async () => {
  const { token } = await createSession('tenant', 'fake-tenant-id');
  const result = await getSession(token);
  assert.deepEqual(result, { subjectType: 'tenant', subjectId: 'fake-tenant-id' });

  const row = await prisma.session.findUnique({ where: { token } });
  assert.ok(row, 'a still-valid session should not be deleted');
});

test('getSession returns null for a token that was never created', async () => {
  const result = await getSession('not-a-real-token');
  assert.equal(result, null);
});

// Regression tests for a real vulnerability: cookie-parser auto-JSON-parses
// any "j:..." cookie value, so callers reading a session token straight off
// req.cookies can hand getSession()/destroySession() a plain object (e.g. a
// Prisma filter like { not: '' }) instead of a string, despite the `string`
// type in their signatures. Both functions accept `unknown` and must reject
// anything that isn't a real, non-empty string BEFORE it reaches Prisma's
// `where: { token }` -- this is the actual security boundary (see the
// auth.test.ts integration test for the full exploit path via the logout
// route this was originally found through).
test('getSession returns null (not a Prisma error, not a match) for a non-string token', async () => {
  await createSession('tenant', 'fake-tenant-id');
  const asObject = await getSession({ not: '' } as unknown as string);
  assert.equal(asObject, null);
  const asArray = await getSession(['token'] as unknown as string);
  assert.equal(asArray, null);
  const asEmptyString = await getSession('');
  assert.equal(asEmptyString, null);
});

test('destroySession is a no-op (does not touch any row) for a non-string token', async () => {
  const { token } = await createSession('tenant', 'fake-tenant-id');
  await destroySession({ not: '' } as unknown as string);

  // The real assertion: a filter-shaped token must not have deleted the
  // genuine, unrelated session created above.
  const stillThere = await prisma.session.findUnique({ where: { token } });
  assert.ok(stillThere, 'an unrelated real session must survive a non-string destroySession call');
});
