import { prisma } from '../../src/db/client.js';

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
  await prisma.tenant.deleteMany();
  await prisma.platformAdmin.deleteMany();
}
