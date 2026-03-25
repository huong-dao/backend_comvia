/**
 * Tạo user role STAFF + credential (bcrypt) + wallet, status ACTIVE.
 *
 * Usage (PowerShell):
 *   $env:STAFF_EMAIL="staff@comvia.local"; $env:STAFF_PASSWORD="YourSecurePass12"; node scripts/create-staff-user.cjs
 *
 * Env:
 *   DATABASE_URL   — bắt buộc (hoặc có trong .env qua dotenv)
 *   STAFF_EMAIL    — mặc định staff@comvia.local
 *   STAFF_PASSWORD — bắt buộc, tối thiểu 8 ký tự
 *   STAFF_FULL_NAME — mặc định "System Staff"
 */
require('dotenv/config');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const SALT_ROUNDS = 10;

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('Missing DATABASE_URL');
    process.exit(1);
  }

  const email = process.env.STAFF_EMAIL || 'staff@comvia.local';
  const password = process.env.STAFF_PASSWORD;
  if (!password || password.length < 8) {
    console.error(
      'Set STAFF_PASSWORD (min 8 characters). Example:\n' +
        '  STAFF_EMAIL=staff@comvia.local STAFF_PASSWORD=YourSecurePass12 node scripts/create-staff-user.cjs',
    );
    process.exit(1);
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      console.error('User already exists:', email);
      process.exit(1);
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await prisma.user.create({
      data: {
        email,
        fullName: process.env.STAFF_FULL_NAME || 'System Staff',
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
      role: user.role,
      status: user.status,
    });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
