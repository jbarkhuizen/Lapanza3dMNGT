import { prisma } from '../src/db/client.js';
import { hashPassword } from '../src/auth/password.js';

async function main() {
  const [, , email, password] = process.argv;
  if (!email || !password) {
    console.error('Usage: npx tsx scripts/create-admin.ts <email> <password>');
    process.exitCode = 1;
    return;
  }

  const existing = await prisma.platformAdmin.findUnique({ where: { email } });
  if (existing) {
    console.error(`A platform admin with email ${email} already exists.`);
    process.exitCode = 1;
    return;
  }

  const passwordHash = await hashPassword(password);
  const admin = await prisma.platformAdmin.create({ data: { email, passwordHash } });
  console.log(`Created platform admin ${admin.email} (id ${admin.id}).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
