import { prisma } from '../../src/db/client.js';

export async function resetTestDatabase() {
  await prisma.printerMaintenanceLog.deleteMany();
  await prisma.printerPreset.deleteMany();
  await prisma.printer.deleteMany();
  await prisma.filament.deleteMany();
  await prisma.labourStep.deleteMany();
  await prisma.consumable.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.session.deleteMany();
  await prisma.tenant.deleteMany();
  await prisma.platformAdmin.deleteMany();
}
