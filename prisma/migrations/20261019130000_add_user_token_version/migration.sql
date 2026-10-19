-- Incremented whenever all existing access tokens for a user must be revoked.
ALTER TABLE "User" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;
