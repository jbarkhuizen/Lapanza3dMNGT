// One-off import of the historical backlog snapshot into the real
// BacklogItem table. Idempotent (upserts by `number`) so it's safe to
// re-run — but it's a one-time historical import, not a recurring seed;
// new items should be created through the admin center itself from here on.
import { prisma } from '../src/db/client.js';
import { BACKLOG_SEED_DATA } from '../prisma/backlogSeedData.js';

async function main() {
  for (const item of BACKLOG_SEED_DATA) {
    await prisma.backlogItem.upsert({
      where: { number: item.number },
      create: {
        number: item.number,
        title: item.title,
        description: item.description,
        category: item.category,
        priority: item.priority,
        status: item.status,
        dateAdded: new Date(item.dateAdded),
        actualFixDate: item.actualFixDate ? new Date(item.actualFixDate) : null,
      },
      update: {
        title: item.title,
        description: item.description,
        category: item.category,
        priority: item.priority,
        status: item.status,
        dateAdded: new Date(item.dateAdded),
        actualFixDate: item.actualFixDate ? new Date(item.actualFixDate) : null,
      },
    });
  }
  console.log(`Imported ${BACKLOG_SEED_DATA.length} backlog items.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
