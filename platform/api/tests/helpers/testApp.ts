import { prisma } from '../../src/db/client.js';

const SEED_PLANS = [
  { name: 'Tier 1', monthlyPrice: '25.00', sortOrder: 1 },
  { name: 'Tier 2', monthlyPrice: '45.00', sortOrder: 2 },
  { name: 'Tier 3', monthlyPrice: '70.00', sortOrder: 3 },
];

export async function resetTestDatabase() {
  await prisma.costingLabourLine.deleteMany();
  await prisma.costingConsumableLine.deleteMany();
  await prisma.costingTemplate.deleteMany();
  await prisma.printerMaintenanceLog.deleteMany();
  await prisma.printerPreset.deleteMany();
  await prisma.printer.deleteMany();
  await prisma.filament.deleteMany();
  await prisma.labourStep.deleteMany();
  await prisma.consumable.deleteMany();
  await prisma.invoiceLineItem.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.quoteLineItem.deleteMany();
  await prisma.quote.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.session.deleteMany();
  await prisma.tenantSequence.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.tenant.deleteMany();
  await prisma.platformAdmin.deleteMany();
  await prisma.backlogItem.deleteMany();
  // Plan used to be find-if-missing rather than deleted and recreated
  // like every other table above — meaning any test anywhere in the
  // suite that creates its own ad-hoc plan (for a Subscription fixture)
  // leaves it sitting there for the rest of the run, since nothing ever
  // wipes it. Two independent exact-plan-count assertions (in
  // billing.test.ts and public.test.ts) intermittently failed against
  // that accumulation depending on file execution order before this was
  // fixed to actually reset like the rest of this function's name promises.
  await prisma.plan.deleteMany();

  for (const plan of SEED_PLANS) {
    await prisma.plan.create({ data: plan });
  }
}
