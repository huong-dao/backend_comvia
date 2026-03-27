/**
 * Xóa các bản ghi TopupRequest có qrContent = ''
 *
 * Usage:
 *   node scripts/cleanup-empty-qr-content.cjs
 */
require('dotenv/config');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('Missing DATABASE_URL');
    process.exit(1);
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  try {
    const result = await prisma.topupRequest.deleteMany({
      where: {
        qrContent: { equals: '' },
      },
    });

    console.log(`Deleted ${result.count} topup requests with empty qrContent`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});