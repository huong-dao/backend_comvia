/*
  Warnings:

  - You are about to drop the column `qrContent` on the `TopupRequest` table. All the data in the column will be lost.
  - You are about to drop the column `qrExpiredAt` on the `TopupRequest` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "TopupRequest" DROP COLUMN "qrContent",
DROP COLUMN "qrExpiredAt",
ADD COLUMN     "qrCodeUrl" TEXT;
