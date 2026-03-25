-- CreateEnum
CREATE TYPE "OtpTargetType" AS ENUM ('EMAIL', 'PHONE');

-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('REGISTER', 'FORGOT_PASSWORD');

-- CreateEnum
CREATE TYPE "OtpStatus" AS ENUM ('ACTIVE', 'USED', 'EXPIRED', 'LOCKED');

-- AlterEnum
ALTER TYPE "UserStatus" ADD VALUE 'PENDING_VERIFICATION';

-- CreateTable
CREATE TABLE "OtpRequest" (
    "id" TEXT NOT NULL,
    "targetType" "OtpTargetType" NOT NULL,
    "targetValue" TEXT NOT NULL,
    "purpose" "OtpPurpose" NOT NULL,
    "otpCodeHash" TEXT NOT NULL,
    "expiredAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "status" "OtpStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OtpRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OtpRequest_targetType_targetValue_purpose_status_idx" ON "OtpRequest"("targetType", "targetValue", "purpose", "status");

-- CreateIndex
CREATE INDEX "OtpRequest_targetValue_idx" ON "OtpRequest"("targetValue");
