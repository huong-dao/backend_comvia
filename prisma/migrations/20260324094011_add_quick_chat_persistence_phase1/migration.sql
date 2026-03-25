-- CreateEnum
CREATE TYPE "QuickChatMessageRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "QuickChatActionStatus" AS ENUM ('PENDING_CONFIRMATION', 'EXECUTED', 'CANCELLED', 'REJECTED');

-- CreateTable
CREATE TABLE "QuickChatAgentProfile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "systemPrompt" TEXT NOT NULL,
    "allowedTools" JSONB NOT NULL,
    "skills" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuickChatAgentProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuickChatSession" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "agentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuickChatSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuickChatMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "QuickChatMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuickChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuickChatAction" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "argsJson" JSONB NOT NULL,
    "summary" TEXT NOT NULL,
    "status" "QuickChatActionStatus" NOT NULL DEFAULT 'PENDING_CONFIRMATION',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "executedAt" TIMESTAMP(3),

    CONSTRAINT "QuickChatAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuickChatExecutionLog" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "actionId" TEXT,
    "userId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "inputJson" JSONB NOT NULL,
    "outputJson" JSONB,
    "errorMessage" TEXT,
    "durationMs" INTEGER,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuickChatExecutionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuickChatSession_workspaceId_createdAt_idx" ON "QuickChatSession"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "QuickChatSession_userId_createdAt_idx" ON "QuickChatSession"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "QuickChatMessage_sessionId_createdAt_idx" ON "QuickChatMessage"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "QuickChatAction_sessionId_createdAt_idx" ON "QuickChatAction"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "QuickChatAction_status_createdAt_idx" ON "QuickChatAction"("status", "createdAt");

-- CreateIndex
CREATE INDEX "QuickChatExecutionLog_sessionId_createdAt_idx" ON "QuickChatExecutionLog"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "QuickChatExecutionLog_actionId_createdAt_idx" ON "QuickChatExecutionLog"("actionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "QuickChatExecutionLog_idempotencyKey_key" ON "QuickChatExecutionLog"("idempotencyKey");

-- AddForeignKey
ALTER TABLE "QuickChatSession" ADD CONSTRAINT "QuickChatSession_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuickChatSession" ADD CONSTRAINT "QuickChatSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuickChatSession" ADD CONSTRAINT "QuickChatSession_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "QuickChatAgentProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuickChatMessage" ADD CONSTRAINT "QuickChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "QuickChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuickChatMessage" ADD CONSTRAINT "QuickChatMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuickChatAction" ADD CONSTRAINT "QuickChatAction_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "QuickChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuickChatAction" ADD CONSTRAINT "QuickChatAction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuickChatExecutionLog" ADD CONSTRAINT "QuickChatExecutionLog_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "QuickChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuickChatExecutionLog" ADD CONSTRAINT "QuickChatExecutionLog_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "QuickChatAction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuickChatExecutionLog" ADD CONSTRAINT "QuickChatExecutionLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
