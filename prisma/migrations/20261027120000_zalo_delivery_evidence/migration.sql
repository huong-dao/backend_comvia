ALTER TABLE "MessageLog"
  ADD COLUMN "providerTrackingId" TEXT,
  ADD COLUMN "providerSentAt" TIMESTAMP(3),
  ADD COLUMN "providerDeliveredAt" TIMESTAMP(3),
  ADD COLUMN "providerQuotaDaily" INTEGER,
  ADD COLUMN "providerQuotaRemaining" INTEGER;

CREATE INDEX "MessageLog_providerMessageId_idx"
  ON "MessageLog"("providerMessageId");

CREATE TABLE "ZaloDeliveryEvent" (
  "id" TEXT NOT NULL,
  "providerMessageId" TEXT NOT NULL,
  "trackingId" TEXT,
  "eventName" TEXT NOT NULL,
  "deliveryTime" TIMESTAMP(3) NOT NULL,
  "appId" TEXT NOT NULL,
  "payloadJson" JSONB NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "messageLogId" TEXT,

  CONSTRAINT "ZaloDeliveryEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ZaloDeliveryEvent_providerMessageId_eventName_key"
  ON "ZaloDeliveryEvent"("providerMessageId", "eventName");
CREATE INDEX "ZaloDeliveryEvent_messageLogId_deliveryTime_idx"
  ON "ZaloDeliveryEvent"("messageLogId", "deliveryTime");

ALTER TABLE "ZaloDeliveryEvent"
  ADD CONSTRAINT "ZaloDeliveryEvent_messageLogId_fkey"
  FOREIGN KEY ("messageLogId") REFERENCES "MessageLog"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
