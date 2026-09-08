import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PLANS = [
  { name: 'Tier 1', monthlyPrice: '25.00', sortOrder: 1 },
  { name: 'Tier 2', monthlyPrice: '45.00', sortOrder: 2 },
  { name: 'Tier 3', monthlyPrice: '70.00', sortOrder: 3 },
];

async function main() {
  for (const plan of PLANS) {
    const existing = await prisma.plan.findFirst({ where: { name: plan.name } });
    if (existing) {
      await prisma.plan.update({ where: { id: existing.id }, data: plan });
    } else {
      await prisma.plan.create({ data: plan });
    }
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
