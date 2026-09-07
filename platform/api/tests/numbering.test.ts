import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { resetTestDatabase } from './helpers/testApp.js';
import { prisma } from '../src/db/client.js';
import { hashPassword } from '../src/auth/password.js';
import { tenantScope } from '../src/db/scoped.js';
import { formatDocumentNumber } from '../src/lib/numbering.js';

beforeEach(resetTestDatabase);

async function makeTenant(email: string) {
  return prisma.tenant.create({
    data: {
      businessName: 'Test Co',
      contactName: 'Test Person',
      email,
      passwordHash: await hashPassword('irrelevant password value'),
    },
  });
}

test('formatDocumentNumber pads to 4 digits', () => {
  assert.equal(formatDocumentNumber('QT', 1), 'QT-0001');
  assert.equal(formatDocumentNumber('INV', 42), 'INV-0042');
  assert.equal(formatDocumentNumber('QT', 10000), 'QT-10000');
});

test('next() starts at 1 and increments per call', async () => {
  const tenant = await makeTenant('a@example.co.za');
  const scoped = tenantScope(tenant.id);

  assert.equal(await scoped.tenantSequences.next('quote'), 1);
  assert.equal(await scoped.tenantSequences.next('quote'), 2);
  assert.equal(await scoped.tenantSequences.next('quote'), 3);
});

test('quote and invoice sequences are independent', async () => {
  const tenant = await makeTenant('a@example.co.za');
  const scoped = tenantScope(tenant.id);

  assert.equal(await scoped.tenantSequences.next('quote'), 1);
  assert.equal(await scoped.tenantSequences.next('invoice'), 1);
  assert.equal(await scoped.tenantSequences.next('quote'), 2);
});

test('concurrent next() calls never return a duplicate value', async () => {
  const tenant = await makeTenant('a@example.co.za');
  const scoped = tenantScope(tenant.id);

  const results = await Promise.all(
    Array.from({ length: 10 }, () => scoped.tenantSequences.next('quote')),
  );
  const unique = new Set(results);
  assert.equal(unique.size, 10);
  assert.deepEqual([...results].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});
