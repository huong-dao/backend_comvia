-- Split WorkspaceOaConnection into WorkspaceOa (user-managed profile) + WorkspaceOaConnection (Zalo OAuth).
-- ADR-001. Reuses the old connection id as WorkspaceOa.id so child FK values stay valid without re-mapping.

-- ---------------------------------------------------------------------------
-- Step 1: Create WorkspaceOa and backfill one profile row per existing connection (reuse id).
-- ---------------------------------------------------------------------------
CREATE TABLE "WorkspaceOa" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "avatarUrl" TEXT,
    "logoLightUrl" TEXT,
    "logoDarkUrl" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceOa_pkey" PRIMARY KEY ("id")
);

-- Reuse old connection id + workspaceId. name falls back to a workspace-derived code when oaName is null/empty.
-- code mirrors name (non-empty default); other hand-entered fields stay null (profile is an independent source).
INSERT INTO "WorkspaceOa" ("id", "workspaceId", "name", "code", "createdAt", "updatedAt")
SELECT
    "id",
    "workspaceId",
    COALESCE(NULLIF("oaName", ''), 'OA_' || RIGHT("workspaceId", 8)),
    COALESCE(NULLIF("oaName", ''), 'OA_' || RIGHT("workspaceId", 8)),
    "createdAt",
    "updatedAt"
FROM "WorkspaceOaConnection";

CREATE UNIQUE INDEX "WorkspaceOa_workspaceId_key" ON "WorkspaceOa"("workspaceId");

ALTER TABLE "WorkspaceOa" ADD CONSTRAINT "WorkspaceOa_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Step 2: Link WorkspaceOaConnection to its profile via workspaceOaId (= own id), drop workspaceId.
-- ---------------------------------------------------------------------------
ALTER TABLE "WorkspaceOaConnection" ADD COLUMN "workspaceOaId" TEXT;
UPDATE "WorkspaceOaConnection" SET "workspaceOaId" = "id";
ALTER TABLE "WorkspaceOaConnection" ALTER COLUMN "workspaceOaId" SET NOT NULL;

CREATE UNIQUE INDEX "WorkspaceOaConnection_workspaceOaId_key" ON "WorkspaceOaConnection"("workspaceOaId");

ALTER TABLE "WorkspaceOaConnection" DROP CONSTRAINT "WorkspaceOaConnection_workspaceId_fkey";
DROP INDEX "WorkspaceOaConnection_workspaceId_key";
ALTER TABLE "WorkspaceOaConnection" DROP COLUMN "workspaceId";

ALTER TABLE "WorkspaceOaConnection" ADD CONSTRAINT "WorkspaceOaConnection_workspaceOaId_fkey"
    FOREIGN KEY ("workspaceOaId") REFERENCES "WorkspaceOa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Step 3: Re-point Template / MessageLog / Campaign FKs to WorkspaceOa.
-- Column name (oaConnectionId) and values are unchanged (id reuse) -> no re-map, no orphan rows.
-- ---------------------------------------------------------------------------
ALTER TABLE "Template" DROP CONSTRAINT "Template_oaConnectionId_fkey";
ALTER TABLE "Template" ADD CONSTRAINT "Template_oaConnectionId_fkey"
    FOREIGN KEY ("oaConnectionId") REFERENCES "WorkspaceOa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MessageLog" DROP CONSTRAINT "MessageLog_oaConnectionId_fkey";
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_oaConnectionId_fkey"
    FOREIGN KEY ("oaConnectionId") REFERENCES "WorkspaceOa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Campaign" DROP CONSTRAINT "Campaign_oaConnectionId_fkey";
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_oaConnectionId_fkey"
    FOREIGN KEY ("oaConnectionId") REFERENCES "WorkspaceOa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Step 4: oaName / oaAvatarLight / oaAvatarDark stay on WorkspaceOaConnection (Zalo-provided,
-- display-only). Not copied into the profile — the profile is an independent source with its
-- hand-entered fields left blank by default.
-- ---------------------------------------------------------------------------
