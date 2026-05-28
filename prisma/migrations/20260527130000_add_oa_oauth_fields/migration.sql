-- AlterTable
ALTER TABLE "WorkspaceOaConnection" ALTER COLUMN "accessToken" DROP NOT NULL;
ALTER TABLE "WorkspaceOaConnection" ALTER COLUMN "refreshToken" DROP NOT NULL;
ALTER TABLE "WorkspaceOaConnection" ALTER COLUMN "tokenExpiredAt" DROP NOT NULL;

ALTER TABLE "WorkspaceOaConnection" ADD COLUMN "oauthState" TEXT;
ALTER TABLE "WorkspaceOaConnection" ADD COLUMN "oauthCodeVerifier" TEXT;
ALTER TABLE "WorkspaceOaConnection" ADD COLUMN "oauthStateExpiresAt" TIMESTAMP(3);

CREATE INDEX "WorkspaceOaConnection_oauthState_idx" ON "WorkspaceOaConnection"("oauthState");
