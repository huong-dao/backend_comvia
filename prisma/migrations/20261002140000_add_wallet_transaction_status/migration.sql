-- Add wallet transaction status lifecycle (ISSUE-009, BR-WALLET-03/05/06).
-- Additive and non-breaking: the new enum column has DEFAULT 'SUCCESS', so every
-- existing row is backfilled to SUCCESS via the column default (no manual UPDATE),
-- matching BR-WALLET-06 (all current transactions are written post-finalization).
-- On PostgreSQL >= 11 an ADD COLUMN NOT NULL DEFAULT <constant> is a metadata-only
-- operation and does not rewrite the table.

-- ---------------------------------------------------------------------------
-- Step 1: WalletTransactionStatus enum.
-- ---------------------------------------------------------------------------
CREATE TYPE "WalletTransactionStatus" AS ENUM ('SUCCESS', 'PENDING', 'FAILED');

-- ---------------------------------------------------------------------------
-- Step 2: New status column on WalletTransaction, defaulting to SUCCESS.
-- ---------------------------------------------------------------------------
ALTER TABLE "WalletTransaction"
  ADD COLUMN "status" "WalletTransactionStatus" NOT NULL DEFAULT 'SUCCESS';
