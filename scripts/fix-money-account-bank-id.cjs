require('dotenv/config');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    // Cập nhật pay2sBankId thành bank code (VCB) thay vì numeric ID (970418)
    // Theo tài liệu Pay2S, bank_id phải là bank code như "ACB", "VCB", "BIDV"
    const updated = await prisma.moneyAccount.update({
      where: { id: 'cmn7g3kny0000i0ulmcabbpw3' },
      data: { pay2sBankId: 'VCB' }, // Vietcombank bank code theo Pay2S docs
    });
    console.log('Updated Money Account:', JSON.stringify(updated, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);