import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/db/client.js';
import { createSession, getSession } from '../src/auth/session.js';
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
