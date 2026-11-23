-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('TOPUP', 'SUBSCRIPTION');

-- CreateEnum
CREATE TYPE "SubscriptionPurchaseStatus" AS ENUM ('PENDING', 'PAID', 'FAILED');

-- CreateEnum
CREATE TYPE "WorkspaceSubscriptionStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- AlterTable
ALTER TABLE "WalletAccount" ADD COLUMN     "lowBalanceEmailSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PaymentCallbackLog" ADD COLUMN     "subscriptionPurchaseId" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "subscriptionPurchaseId" TEXT,
ADD COLUMN     "type" "OrderType" NOT NULL DEFAULT 'TOPUP';

-- AlterTable
ALTER TABLE "SystemConfig" ADD COLUMN     "subscriptionExpiryReminderDays" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "walletLowBalanceThreshold" DECIMAL(65,30);

-- CreateTable
CREATE TABLE "SubscriptionPlan" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priceExclVat" DECIMAL(65,30) NOT NULL,
    "vatPercent" DECIMAL(65,30) NOT NULL DEFAULT 10,
    "durationYears" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionPurchase" (
    "id" TEXT NOT NULL,
    "purchaseCode" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "planName" TEXT NOT NULL,
    "durationYears" INTEGER NOT NULL,
    "amountExclVat" DECIMAL(65,30) NOT NULL,
    "vatPercent" DECIMAL(65,30) NOT NULL,
    "vatAmount" DECIMAL(65,30) NOT NULL,
    "amountInclVat" DECIMAL(65,30) NOT NULL,
    "paymentProvider" TEXT NOT NULL,
    "paymentRef" TEXT,
    "qrCodeUrl" TEXT,
    "status" "SubscriptionPurchaseStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceSubscription" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "purchaseId" TEXT,
    "orderId" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "status" "WorkspaceSubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiryReminderSentAt" TIMESTAMP(3),
    "grantedByUserId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPlan_code_key" ON "SubscriptionPlan"("code");

-- CreateIndex
CREATE INDEX "SubscriptionPlan_isActive_sortOrder_idx" ON "SubscriptionPlan"("isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPurchase_purchaseCode_key" ON "SubscriptionPurchase"("purchaseCode");

-- CreateIndex
CREATE INDEX "SubscriptionPurchase_workspaceId_createdAt_idx" ON "SubscriptionPurchase"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceSubscription_purchaseId_key" ON "WorkspaceSubscription"("purchaseId");

-- CreateIndex
CREATE INDEX "WorkspaceSubscription_workspaceId_endsAt_idx" ON "WorkspaceSubscription"("workspaceId", "endsAt");

-- CreateIndex
CREATE INDEX "WorkspaceSubscription_status_endsAt_idx" ON "WorkspaceSubscription"("status", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "Order_subscriptionPurchaseId_key" ON "Order"("subscriptionPurchaseId");

-- AddForeignKey
ALTER TABLE "PaymentCallbackLog" ADD CONSTRAINT "PaymentCallbackLog_subscriptionPurchaseId_fkey" FOREIGN KEY ("subscriptionPurchaseId") REFERENCES "SubscriptionPurchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_subscriptionPurchaseId_fkey" FOREIGN KEY ("subscriptionPurchaseId") REFERENCES "SubscriptionPurchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionPurchase" ADD CONSTRAINT "SubscriptionPurchase_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionPurchase" ADD CONSTRAINT "SubscriptionPurchase_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionPurchase" ADD CONSTRAINT "SubscriptionPurchase_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceSubscription" ADD CONSTRAINT "WorkspaceSubscription_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceSubscription" ADD CONSTRAINT "WorkspaceSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceSubscription" ADD CONSTRAINT "WorkspaceSubscription_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "SubscriptionPurchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceSubscription" ADD CONSTRAINT "WorkspaceSubscription_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

