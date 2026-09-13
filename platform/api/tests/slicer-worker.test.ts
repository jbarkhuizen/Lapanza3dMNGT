import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/db/client.js';
import { tenantScope, sweepStaleProcessingSliceJobs, findOldestQueuedSliceJobAcrossAllTenants } from '../src/db/scoped.js';
import { resetTestDatabase } from './helpers/testApp.js';

beforeEach(resetTestDatabase);

async function createTenant(email: string) {
  return prisma.tenant.create({
    data: {
      businessName: 'Acme Prints',
      contactName: 'Jane Doe',
      email,
      passwordHash: 'not-a-real-hash',
    },
  });
}

test('a SliceJob stuck in processing older than the threshold is swept back to queued', async () => {
  const tenant = await createTenant('jane@acmeprints.co.za');
  const scoped = tenantScope(tenant.id);
  const job = await scoped.sliceJobs.create({ originFileName: 'model.stl' });
  await prisma.sliceJob.update({
    where: { id: job.id },
    data: { status: 'processing', createdAt: new Date(Date.now() - 10 * 60 * 1000) },
  });

  await sweepStaleProcessingSliceJobs(60 * 1000); // 1 minute threshold, job is 10 minutes old

  const swept = await scoped.sliceJobs.findById(job.id);
  assert.equal(swept?.status, 'queued');
});

test('a SliceJob still within the threshold is left alone', async () => {
  const tenant = await createTenant('jane@acmeprints.co.za');
  const scoped = tenantScope(tenant.id);
  const job = await scoped.sliceJobs.create({ originFileName: 'model.stl' });
  await prisma.sliceJob.update({ where: { id: job.id }, data: { status: 'processing' } });

  await sweepStaleProcessingSliceJobs(60 * 60 * 1000); // 1 hour threshold, job is brand new

  const notSwept = await scoped.sliceJobs.findById(job.id);
  assert.equal(notSwept?.status, 'processing');
});

test('findOldestQueuedSliceJobAcrossAllTenants finds the oldest queued job across tenants, FIFO', async () => {
  const tenantA = await createTenant('jane@acmeprints.co.za');
  const tenantB = await createTenant('bob@othershop.co.za');
  const scopedA = tenantScope(tenantA.id);
  const scopedB = tenantScope(tenantB.id);

  const first = await scopedA.sliceJobs.create({ originFileName: 'first.stl' });
  // Ensure distinguishable createdAt ordering across the two inserts.
  await prisma.sliceJob.update({ where: { id: first.id }, data: { createdAt: new Date(Date.now() - 5000) } });
  await scopedB.sliceJobs.create({ originFileName: 'second.stl' });

  const oldest = await findOldestQueuedSliceJobAcrossAllTenants();
  assert.equal(oldest?.id, first.id);
});
