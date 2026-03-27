-- CreateEnum
CREATE TYPE "CollectionRequestType" AS ENUM ('TOPUP', 'INVOICE');

-- CreateEnum
CREATE TYPE "CollectionRequestStatus" AS ENUM ('PENDING', 'PAID', 'CANCELED', 'FAILED');

-- CreateTable
CREATE TABLE "CollectionRequest" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "CollectionRequestType" NOT NULL,
    "status" "CollectionRequestStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(65,30) NOT NULL,
    "qrCodeUrl" TEXT,
    "transId" TEXT,
    "paidAt" TIMESTAMP(3),
    "moneyAccountId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "orderId" TEXT,
    "topupRequestId" TEXT,
    "creatorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollectionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionRequestMapping" (
    "id" TEXT NOT NULL,
    "collectionRequestId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "amount" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "CollectionRequestMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MoneyAccount" (
    "id" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "bankName" TEXT,
    "bankCode" TEXT,
    "pay2sBankId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MoneyAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CollectionRequest_code_key" ON "CollectionRequest"("code");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionRequest_topupRequestId_key" ON "CollectionRequest"("topupRequestId");

-- CreateIndex
CREATE INDEX "CollectionRequest_workspaceId_createdAt_idx" ON "CollectionRequest"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "CollectionRequest_status_createdAt_idx" ON "CollectionRequest"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionRequestMapping_collectionRequestId_invoiceId_key" ON "CollectionRequestMapping"("collectionRequestId", "invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "MoneyAccount_accountNumber_key" ON "MoneyAccount"("accountNumber");

-- AddForeignKey
ALTER TABLE "CollectionRequest" ADD CONSTRAINT "CollectionRequest_moneyAccountId_fkey" FOREIGN KEY ("moneyAccountId") REFERENCES "MoneyAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionRequest" ADD CONSTRAINT "CollectionRequest_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionRequest" ADD CONSTRAINT "CollectionRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionRequest" ADD CONSTRAINT "CollectionRequest_topupRequestId_fkey" FOREIGN KEY ("topupRequestId") REFERENCES "TopupRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionRequest" ADD CONSTRAINT "CollectionRequest_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionRequestMapping" ADD CONSTRAINT "CollectionRequestMapping_collectionRequestId_fkey" FOREIGN KEY ("collectionRequestId") REFERENCES "CollectionRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionRequestMapping" ADD CONSTRAINT "CollectionRequestMapping_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
