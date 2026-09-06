import { prisma } from '../../src/db/client.js';

export async function resetTestDatabase() {
  await prisma.customer.deleteMany();
  await prisma.session.deleteMany();
  await prisma.tenant.deleteMany();
  await prisma.platformAdmin.deleteMany();
}
