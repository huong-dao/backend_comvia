-- ISSUE-003: sliding 30-day session via refresh token rotation.
-- Tracks the jti of the single refresh token currently valid for the user.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "currentRefreshTokenId" TEXT;
