-- Tách oauthState/oauthCodeVerifier/oauthStateExpiresAt khỏi WorkspaceOaConnection
-- ra bảng riêng OaOAuthAttempt (1-nhiều). Trước đây 3 cột này nằm trên row
-- connection duy nhất (workspaceOaId @unique), nên mỗi lần bấm "Kết nối" sẽ
-- ghi đè state/verifier của lần trước -> link cũ báo "Invalid or expired OAuth
-- state" dù chưa hết hạn TTL. Giờ mỗi lần bấm tạo 1 row attempt độc lập.

-- ---------------------------------------------------------------------------
-- Step 1: Bảng OaOAuthAttempt mới.
-- ---------------------------------------------------------------------------
CREATE TABLE "OaOAuthAttempt" (
    "id" TEXT NOT NULL,
    "workspaceOaId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "codeVerifier" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OaOAuthAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OaOAuthAttempt_state_key" ON "OaOAuthAttempt"("state");
CREATE INDEX "OaOAuthAttempt_workspaceOaId_idx" ON "OaOAuthAttempt"("workspaceOaId");

ALTER TABLE "OaOAuthAttempt"
  ADD CONSTRAINT "OaOAuthAttempt_workspaceOaId_fkey"
  FOREIGN KEY ("workspaceOaId") REFERENCES "WorkspaceOa"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Step 2: Di chuyển dữ liệu attempt đang dang dở (nếu có) sang bảng mới,
-- trước khi xóa cột cũ — tránh làm mất 1 lần "Kết nối" đang chờ callback.
-- ---------------------------------------------------------------------------
INSERT INTO "OaOAuthAttempt" ("id", "workspaceOaId", "state", "codeVerifier", "expiresAt", "createdAt")
SELECT
  gen_random_uuid()::text,
  "workspaceOaId",
  "oauthState",
  "oauthCodeVerifier",
  "oauthStateExpiresAt",
  CURRENT_TIMESTAMP
FROM "WorkspaceOaConnection"
WHERE "oauthState" IS NOT NULL
  AND "oauthCodeVerifier" IS NOT NULL
  AND "oauthStateExpiresAt" IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Step 3: Bỏ index cũ + 3 cột oauth khỏi WorkspaceOaConnection.
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS "WorkspaceOaConnection_oauthState_idx";

ALTER TABLE "WorkspaceOaConnection"
  DROP COLUMN "oauthState",
  DROP COLUMN "oauthCodeVerifier",
  DROP COLUMN "oauthStateExpiresAt";
