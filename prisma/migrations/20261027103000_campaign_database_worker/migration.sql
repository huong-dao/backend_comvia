-- Durable database-backed campaign worker with at-most-once dispatch claims.
CREATE TYPE "CampaignRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'PAUSED');

ALTER TYPE "CampaignRowStatus" ADD VALUE 'PROCESSING';
ALTER TYPE "CampaignRowStatus" ADD VALUE 'RECONCILIATION_REQUIRED';

CREATE TABLE "CampaignRun" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "operatorUserId" TEXT NOT NULL,
    "unitPrice" DECIMAL NOT NULL,
    "totalCharged" DECIMAL NOT NULL,
    "totalRefunded" DECIMAL NOT NULL DEFAULT 0,
    "holdTransactionId" TEXT,
    "status" "CampaignRunStatus" NOT NULL DEFAULT 'QUEUED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "CampaignRun_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CampaignRow" ADD COLUMN "campaignRunId" TEXT;
ALTER TABLE "CampaignRow" ADD COLUMN "dispatchStartedAt" TIMESTAMP(3);

CREATE INDEX "CampaignRun_campaignId_status_idx" ON "CampaignRun"("campaignId", "status");
CREATE INDEX "CampaignRow_campaignRunId_status_idx" ON "CampaignRow"("campaignRunId", "status");

ALTER TABLE "CampaignRun" ADD CONSTRAINT "CampaignRun_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignRow" ADD CONSTRAINT "CampaignRow_campaignRunId_fkey"
  FOREIGN KEY ("campaignRunId") REFERENCES "CampaignRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
