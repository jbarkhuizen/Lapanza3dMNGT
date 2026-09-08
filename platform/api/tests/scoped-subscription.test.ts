import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/db/client.js';
import { tenantScope } from '../src/db/scoped.js';
import { resetTestDatabase } from './helpers/testApp.js';

beforeEach(resetTestDatabase);

async function makeTenant(email: string) {
  return prisma.tenant.create({
    data: {
      businessName: 'Acme Prints',
      contactName: 'Jane Doe',
      email,
      passwordHash: 'irrelevant-for-this-test',
    },
  });
}

test('subscription.get returns null when no subscription exists', async () => {
  const tenant = await makeTenant('jane@acmeprints.co.za');
  const scoped = tenantScope(tenant.id);
  const result = await scoped.subscription.get();
  assert.equal(result, null);
});

test('subscription.create + get round-trips, including the plan relation', async () => {
  const tenant = await makeTenant('jane@acmeprints.co.za');
  const plan = await prisma.plan.findFirstOrThrow({ where: { name: 'Tier 1' } });
  const scoped = tenantScope(tenant.id);

  const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  await scoped.subscription.create({
    planId: plan.id,
    status: 'trialing',
    paymentProvider: 'payfast',
    trialEndsAt,
  });

  const result = await scoped.subscription.get();
  assert.ok(result);
  assert.equal(result?.status, 'trialing');
  assert.equal(result?.plan.name, 'Tier 1');
});

test('subscription.updateStatus only affects the owning tenant', async () => {
  const tenantA = await makeTenant('jane@acmeprints.co.za');
  const tenantB = await makeTenant('sam@othershop.co.za');
  const plan = await prisma.plan.findFirstOrThrow({ where: { name: 'Tier 1' } });
  const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  await tenantScope(tenantA.id).subscription.create({
    planId: plan.id, status: 'trialing', paymentProvider: 'payfast', trialEndsAt,
  });
  await tenantScope(tenantB.id).subscription.create({
    planId: plan.id, status: 'trialing', paymentProvider: 'payfast', trialEndsAt,
  });

  await tenantScope(tenantA.id).subscription.updateStatus('active');

  const a = await tenantScope(tenantA.id).subscription.get();
  const b = await tenantScope(tenantB.id).subscription.get();
  assert.equal(a?.status, 'active');
  assert.equal(b?.status, 'trialing');
});
