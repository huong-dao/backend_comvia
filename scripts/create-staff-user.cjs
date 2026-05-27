/**
 * Tạo user role STAFF + credential (bcrypt) + wallet, status ACTIVE.
 *
 * Usage:
 *   node scripts/create-staff-user.cjs
 *
 * Yêu cầu: DATABASE_URL trong .env (dotenv tự load).
 */
require('dotenv/config');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const SALT_ROUNDS = 10;

const STAFF_EMAIL = 'staff@comvia.local';
const STAFF_PASSWORD = 'YourSecurePass12';
const STAFF_FULL_NAME = 'System Staff';

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
    const existing = await prisma.user.findUnique({
      where: { email: STAFF_EMAIL },
    });
    if (existing) {
      console.error('User already exists:', STAFF_EMAIL);
      process.exit(1);
    }

    const passwordHash = await bcrypt.hash(STAFF_PASSWORD, SALT_ROUNDS);

    const user = await prisma.user.create({
      data: {
        email: STAFF_EMAIL,
        fullName: STAFF_FULL_NAME,
        role: 'STAFF',
        status: 'ACTIVE',
        credential: { create: { passwordHash } },
        walletAccount: {
          create: {
            balance: 0,
            totalTopup: 0,
            totalSpent: 0,
            totalRefund: 0,
          },
        },
      },
    });

    console.log('Created STAFF user:', {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      status: user.status,
    });
    console.log('Login with:', {
      email: STAFF_EMAIL,
      password: STAFF_PASSWORD,
    });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
