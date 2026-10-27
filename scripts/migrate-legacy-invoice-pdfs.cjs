/**
 * Moves legacy issued-invoice PDFs from public storage to private storage.
 *
 * Default mode is dry-run. Use --apply only after a backup and release window.
 * The script never prints DATABASE_URL or PDF contents.
 *
 * Usage:
 *   node scripts/migrate-legacy-invoice-pdfs.cjs
 *   node scripts/migrate-legacy-invoice-pdfs.cjs --apply
 */
require('dotenv/config');

const { createHash, randomUUID } = require('crypto');
const {
  access,
  copyFile,
  mkdir,
  readFile,
  rename,
  rm,
} = require('fs/promises');
const { constants } = require('fs');
const { join } = require('path');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');

const LEGACY_PDF_URL =
  /^\/public\/invoices\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_.-]+\.pdf)$/;
const apply = process.argv.includes('--apply');

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function resolveLegacyInvoicePdf(invoice) {
  if (!invoice.invoicePdfUrl) return null;

  const matched = LEGACY_PDF_URL.exec(invoice.invoicePdfUrl);
  if (!matched || matched[1] !== invoice.id) return null;

  const [, invoiceId, fileName] = matched;
  return {
    legacyUrl: invoice.invoicePdfUrl,
    sourcePath: join(process.cwd(), 'public', 'invoices', invoiceId, fileName),
    storageKey: `invoices/${invoiceId}/${fileName}`,
    targetPath: join(process.cwd(), 'private', 'invoices', invoiceId, fileName),
  };
}

async function targetMatchesSource(sourcePath, targetPath) {
  try {
    await access(targetPath, constants.F_OK);
  } catch {
    return false;
  }

  const [source, target] = await Promise.all([
    readFile(sourcePath),
    readFile(targetPath),
  ]);
  return sha256(source) === sha256(target);
}

async function copyAtomically(sourcePath, targetPath) {
  const targetDir = join(targetPath, '..');
  await mkdir(targetDir, { recursive: true });
  const temporaryPath = `${targetPath}.${randomUUID()}.tmp`;

  try {
    await copyFile(sourcePath, temporaryPath);
    await rename(temporaryPath, targetPath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('Missing DATABASE_URL');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  const summary = {
    candidates: 0,
    migrated: 0,
    dryRun: 0,
    skipped: 0,
    failed: 0,
  };

  try {
    const invoices = await prisma.invoice.findMany({
      where: { invoicePdfUrl: { startsWith: '/public/invoices/' } },
      select: {
        id: true,
        invoiceCode: true,
        invoicePdfUrl: true,
        status: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    summary.candidates = invoices.length;

    for (const invoice of invoices) {
      const migration = resolveLegacyInvoicePdf(invoice);
      if (!migration) {
        summary.skipped += 1;
        console.warn(`[skip] ${invoice.invoiceCode}: invalid legacy PDF path`);
        continue;
      }
      if (invoice.status !== 'ISSUED') {
        summary.skipped += 1;
        console.warn(`[skip] ${invoice.invoiceCode}: invoice is not ISSUED`);
        continue;
      }

      try {
        await access(migration.sourcePath, constants.R_OK);
        const targetMatches = await targetMatchesSource(
          migration.sourcePath,
          migration.targetPath,
        );

        if (!apply) {
          summary.dryRun += 1;
          console.log(
            `[dry-run] ${invoice.invoiceCode}: ${migration.legacyUrl} -> ${migration.storageKey}${targetMatches ? ' (private copy already matches)' : ''}`,
          );
          continue;
        }

        if (!targetMatches) {
          try {
            await access(migration.targetPath, constants.F_OK);
            summary.failed += 1;
            console.error(
              `[failed] ${invoice.invoiceCode}: private target exists with different content`,
            );
            continue;
          } catch {
            await copyAtomically(migration.sourcePath, migration.targetPath);
          }
        }

        const updated = await prisma.invoice.updateMany({
          where: { id: invoice.id, invoicePdfUrl: migration.legacyUrl },
          data: { invoicePdfUrl: migration.storageKey },
        });
        if (updated.count !== 1) {
          summary.failed += 1;
          console.error(
            `[failed] ${invoice.invoiceCode}: invoice URL changed while migrating; public file retained`,
          );
          continue;
        }

        await rm(migration.sourcePath);
        summary.migrated += 1;
        console.log(`[migrated] ${invoice.invoiceCode}`);
      } catch (error) {
        summary.failed += 1;
        console.error(
          `[failed] ${invoice.invoiceCode}: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log(
    JSON.stringify({ mode: apply ? 'apply' : 'dry-run', ...summary }),
  );
  if (summary.failed > 0) process.exitCode = 1;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Migration failed');
  process.exitCode = 1;
});
