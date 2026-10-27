CREATE TYPE "PaymentCallbackStatus" AS ENUM ('PAID', 'FAILED');

CREATE TABLE "PaymentCallbackLog" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" "PaymentCallbackStatus" NOT NULL,
    "topupRequestId" TEXT,
    "payloadJson" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workspaceId" TEXT NOT NULL,
    CONSTRAINT "PaymentCallbackLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentCallbackLog_provider_eventId_key" ON "PaymentCallbackLog"("provider", "eventId");
CREATE INDEX "PaymentCallbackLog_topupRequestId_createdAt_idx" ON "PaymentCallbackLog"("topupRequestId", "createdAt");
CREATE INDEX "PaymentCallbackLog_workspaceId_createdAt_idx" ON "PaymentCallbackLog"("workspaceId", "createdAt");

ALTER TABLE "PaymentCallbackLog" ADD CONSTRAINT "PaymentCallbackLog_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentCallbackLog" ADD CONSTRAINT "PaymentCallbackLog_topupRequestId_fkey"
  FOREIGN KEY ("topupRequestId") REFERENCES "TopupRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
