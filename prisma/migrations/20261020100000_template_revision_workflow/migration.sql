-- Template workflow no longer has a REJECTED state. Preserve the historic
-- audit rows, while converting persisted rejected templates/logs to DISABLED.
ALTER TYPE "TemplateStatus" RENAME TO "TemplateStatus_old";
CREATE TYPE "TemplateStatus" AS ENUM (
  'DRAFT',
  'SUBMITTED',
  'PENDING_ZALO_APPROVAL',
  'APPROVED',
  'DISABLED'
);

ALTER TABLE "Template" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "TemplateSubmissionLog" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "Template"
  ALTER COLUMN "status" TYPE "TemplateStatus"
  USING (CASE WHEN "status"::text = 'REJECTED' THEN 'DISABLED' ELSE "status"::text END)::"TemplateStatus";
ALTER TABLE "TemplateSubmissionLog"
  ALTER COLUMN "status" TYPE "TemplateStatus"
  USING (CASE WHEN "status"::text = 'REJECTED' THEN 'DISABLED' ELSE "status"::text END)::"TemplateStatus";

ALTER TABLE "Template" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
DROP TYPE "TemplateStatus_old";

ALTER TABLE "Template"
  ADD COLUMN "requiresOwnerRevision" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "revisionReason" TEXT,
  ADD COLUMN "returnedForRevisionAt" TIMESTAMP(3);
