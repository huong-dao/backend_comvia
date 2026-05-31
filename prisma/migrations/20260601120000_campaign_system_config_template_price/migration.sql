-- CreateTable
CREATE TABLE "SystemConfig" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "defaultMessageUnitPrice" DECIMAL(65,30) NOT NULL DEFAULT 400,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("id")
);

INSERT INTO "SystemConfig" ("id", "defaultMessageUnitPrice", "updatedAt")
VALUES ('singleton', 400, CURRENT_TIMESTAMP);

-- AlterTable
ALTER TABLE "Template" ADD COLUMN "unitPricePerMessage" DECIMAL(65,30);

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "CampaignRow" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
