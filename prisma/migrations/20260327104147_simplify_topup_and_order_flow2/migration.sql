/*
  Warnings:

  - You are about to drop the `PaymentWebhookLog` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "PaymentWebhookLog" DROP CONSTRAINT "PaymentWebhookLog_topupRequestId_fkey";

-- DropTable
DROP TABLE "PaymentWebhookLog";
