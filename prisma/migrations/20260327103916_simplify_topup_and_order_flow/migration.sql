/*
  Warnings:

  - You are about to drop the column `currency` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `orderType` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `paymentMethod` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `paymentRef` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `rawCallbackLog` on the `TopupRequest` table. All the data in the column will be lost.
  - You are about to drop the `CollectionRequest` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `CollectionRequestMapping` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Payment` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[topupRequestId]` on the table `Order` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "CollectionRequest" DROP CONSTRAINT "CollectionRequest_creatorId_fkey";

-- DropForeignKey
ALTER TABLE "CollectionRequest" DROP CONSTRAINT "CollectionRequest_moneyAccountId_fkey";

-- DropForeignKey
ALTER TABLE "CollectionRequest" DROP CONSTRAINT "CollectionRequest_orderId_fkey";

-- DropForeignKey
ALTER TABLE "CollectionRequest" DROP CONSTRAINT "CollectionRequest_topupRequestId_fkey";

-- DropForeignKey
ALTER TABLE "CollectionRequest" DROP CONSTRAINT "CollectionRequest_workspaceId_fkey";

-- DropForeignKey
ALTER TABLE "CollectionRequestMapping" DROP CONSTRAINT "CollectionRequestMapping_collectionRequestId_fkey";

-- DropForeignKey
ALTER TABLE "CollectionRequestMapping" DROP CONSTRAINT "CollectionRequestMapping_invoiceId_fkey";

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_ownerUserId_fkey";

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_workspaceId_fkey";

-- DropForeignKey
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_customerId_fkey";

-- DropForeignKey
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_invoiceId_fkey";

-- DropForeignKey
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_moneyAccountId_fkey";

-- DropForeignKey
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_orderId_fkey";

-- DropForeignKey
ALTER TABLE "TopupRequest" DROP CONSTRAINT "TopupRequest_ownerUserId_fkey";

-- DropForeignKey
ALTER TABLE "TopupRequest" DROP CONSTRAINT "TopupRequest_workspaceId_fkey";

-- DropIndex
DROP INDEX "TopupRequest_paymentProvider_paymentRef_idx";

-- DropIndex
DROP INDEX "TopupRequest_workspaceId_createdAt_idx";

-- AlterTable
ALTER TABLE "Order" DROP COLUMN "currency",
DROP COLUMN "orderType",
DROP COLUMN "paymentMethod",
DROP COLUMN "paymentRef",
ADD COLUMN     "topupRequestId" TEXT;

-- AlterTable
ALTER TABLE "TopupRequest" DROP COLUMN "rawCallbackLog",
ALTER COLUMN "paymentRef" DROP NOT NULL;

-- DropTable
DROP TABLE "CollectionRequest";

-- DropTable
DROP TABLE "CollectionRequestMapping";

-- DropTable
DROP TABLE "Payment";

-- DropEnum
DROP TYPE "CollectionRequestStatus";

-- DropEnum
DROP TYPE "PaymentMethod";

-- CreateIndex
CREATE UNIQUE INDEX "Order_topupRequestId_key" ON "Order"("topupRequestId");

-- AddForeignKey
ALTER TABLE "TopupRequest" ADD CONSTRAINT "TopupRequest_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopupRequest" ADD CONSTRAINT "TopupRequest_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_topupRequestId_fkey" FOREIGN KEY ("topupRequestId") REFERENCES "TopupRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
