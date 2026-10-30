import { PrismaClient } from '@prisma/client';
import { INITIAL_PERMISSION_CATALOG } from '../packages/shared/src/permissions';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  for (const permission of INITIAL_PERMISSION_CATALOG) {
    await prisma.permission.upsert({
      where: { key: permission.key },
      update: { description: permission.description },
      create: permission,
    });
  }
}

main()
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
