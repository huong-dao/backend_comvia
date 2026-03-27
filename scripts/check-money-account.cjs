require('dotenv/config');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    const account = await prisma.moneyAccount.findUnique({
      where: { id: 'cmn7g3kny0000i0ulmcabbpw3' },
    });
    console.log('Money Account:', JSON.stringify(account, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);