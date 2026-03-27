import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const result = await prisma.topupRequest.deleteMany({
    where: {
      qrContent: { equals: '' },
    },
  });

  console.log(`Deleted ${result.count} topup requests with empty qrContent`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());