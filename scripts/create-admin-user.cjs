/**
 * Tạo user role ADMIN + credential (bcrypt) + wallet, status ACTIVE.
 *
 * Usage (PowerShell):
 *   $env:ADMIN_EMAIL="admin@comvia.local"; $env:ADMIN_PASSWORD="YourSecurePass12"; node scripts/create-admin-user.cjs
 *
 * Env:
 *   DATABASE_URL   — bắt buộc (hoặc có trong .env qua dotenv)
 *   ADMIN_EMAIL    — mặc định admin@comvia.local
 *   ADMIN_PASSWORD — bắt buộc, tối thiểu 8 ký tự
 *   ADMIN_FULL_NAME — mặc định "System Admin"
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

  const email = process.env.ADMIN_EMAIL || 'admin@comvia.local';
  const password = process.env.ADMIN_PASSWORD;
  if (!password || password.length < 8) {
    console.error(
      'Set ADMIN_PASSWORD (min 8 characters). Example:\n' +
        '  ADMIN_EMAIL=admin@comvia.local ADMIN_PASSWORD=YourSecurePass12 node scripts/create-admin-user.cjs',
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
        fullName: process.env.ADMIN_FULL_NAME || 'System Admin',
        role: 'ADMIN',
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

    console.log('Created ADMIN user:', {
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
