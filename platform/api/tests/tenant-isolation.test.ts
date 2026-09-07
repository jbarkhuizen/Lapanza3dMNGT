import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { resetTestDatabase } from './helpers/testApp.js';
import { prisma } from '../src/db/client.js';
import { hashPassword } from '../src/auth/password.js';
import { tenantScope } from '../src/db/scoped.js';

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

test('a tenant cannot see another tenant\'s customers', async () => {
  const tenantA = await makeTenant('a@example.co.za');
  const tenantB = await makeTenant('b@example.co.za');

  const scopedA = tenantScope(tenantA.id);
  const scopedB = tenantScope(tenantB.id);

  await scopedA.customers.create({ name: 'Alice Customer', billingAddress: '1 Main Rd' });
  await scopedB.customers.create({ name: 'Bob Customer', billingAddress: '2 Side St' });

  const aList = await scopedA.customers.findMany();
  const bList = await scopedB.customers.findMany();

  assert.equal(aList.length, 1);
  assert.equal(aList[0].name, 'Alice Customer');
  assert.equal(bList.length, 1);
  assert.equal(bList[0].name, 'Bob Customer');
});

test('findById returns null for a customer belonging to a different tenant', async () => {
  const tenantA = await makeTenant('a@example.co.za');
  const tenantB = await makeTenant('b@example.co.za');

  const scopedA = tenantScope(tenantA.id);
  const scopedB = tenantScope(tenantB.id);

  const created = await scopedA.customers.create({ name: 'Alice Customer', billingAddress: '1 Main Rd' });

  const foundByOwner = await scopedA.customers.findById(created.id);
  const foundByOther = await scopedB.customers.findById(created.id);

  assert.ok(foundByOwner);
  assert.equal(foundByOther, null);
});

test('update only affects the owning tenant\'s row', async () => {
  const tenantA = await makeTenant('a@example.co.za');
  const tenantB = await makeTenant('b@example.co.za');

  const scopedA = tenantScope(tenantA.id);
  const scopedB = tenantScope(tenantB.id);

  const created = await scopedA.customers.create({ name: 'Alice Customer', billingAddress: '1 Main Rd' });

  const otherTenantResult = await scopedB.customers.update(created.id, { notes: 'hijacked' });
  assert.equal(otherTenantResult.count, 0);

  const ownerResult = await scopedA.customers.update(created.id, { notes: 'legit update' });
  assert.equal(ownerResult.count, 1);
});

test('tenantScope throws when given a falsy tenantId', () => {
  assert.throws(() => tenantScope(''), /tenantScope requires a tenantId/);
  assert.throws(() => tenantScope(undefined as any), /tenantScope requires a tenantId/);
});

test('update cannot reassign a row to a different tenant via a smuggled tenantId', async () => {
  const tenantA = await makeTenant('a@example.co.za');
  const tenantB = await makeTenant('b@example.co.za');

  const scopedA = tenantScope(tenantA.id);
  const created = await scopedA.customers.create({ name: 'Alice Customer', billingAddress: '1 Main Rd' });

  await scopedA.customers.update(created.id, { tenantId: tenantB.id, notes: 'attempted takeover' } as any);

  const stillOwnedByA = await scopedA.customers.findById(created.id);
  assert.ok(stillOwnedByA, 'row should still belong to tenant A');
  assert.equal(stillOwnedByA?.notes, 'attempted takeover', 'the legitimate field should still update');
});
