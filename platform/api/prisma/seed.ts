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
    if (!existing) {
      // Create-only: a manual price edit in the DB (the intended way to
      // change pricing until the admin center exists — see the design
      // spec) must survive a re-run of this seed script. Only sortOrder
      // and active-flag drift would ever need re-syncing here, and
      // neither of those exists yet, so a bare create-if-missing is
      // correct — revisit if this script ever needs to reconcile more
      // than existence.
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
