-- CreateEnum
CREATE TYPE "ArticleStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "KnowledgeEntityType" AS ENUM ('PROJECT', 'TRACE', 'SPAN', 'ALERT', 'ALERT_HISTORY');

-- CreateEnum
CREATE TYPE "KnowledgeRuleScope" AS ENUM ('WORKSPACE', 'PROJECT');

-- CreateEnum
CREATE TYPE "RuleMatchType" AS ENUM ('DIRECT_LINK', 'RULE', 'SEMANTIC');

-- CreateEnum
CREATE TYPE "ChunkSourceType" AS ENUM ('ARTICLE', 'ATTACHMENT');

-- CreateTable
CREATE TABLE "KnowledgeGroup" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "parentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeArticle" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "groupId" TEXT,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "summary" TEXT,
    "content" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "ArticleStatus" NOT NULL DEFAULT 'DRAFT',
    "searchText" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "lastViewedAt" TIMESTAMP(3),
    "helpfulCount" INTEGER NOT NULL DEFAULT 0,
    "notHelpfulCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "KnowledgeArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeArticleVersion" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "content" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "diff" TEXT,
    "checksum" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeArticleVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeRule" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "scope" "KnowledgeRuleScope" NOT NULL DEFAULT 'WORKSPACE',
    "projectId" TEXT,
    "condition" JSONB NOT NULL,
    "articleId" TEXT,
    "groupId" TEXT,
    "matchReasonTemplate" TEXT,
    "matchCount" INTEGER NOT NULL DEFAULT 0,
    "lastMatchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeLink" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "entityType" "KnowledgeEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeAttachment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "extractedText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeChunk" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sourceType" "ChunkSourceType" NOT NULL DEFAULT 'ARTICLE',
    "sourceId" TEXT,
    "content" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "startOffset" INTEGER NOT NULL,
    "endOffset" INTEGER NOT NULL,
    "sectionTitle" TEXT,
    "embedding" vector(1536),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertRCAKnowledge" (
    "id" TEXT NOT NULL,
    "rcaId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "matchType" "RuleMatchType" NOT NULL,
    "matchScore" DOUBLE PRECISION,
    "matchReason" TEXT,
    "snapshotTitle" TEXT NOT NULL,
    "snapshotExcerpt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlertRCAKnowledge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvalSuiteKnowledge" (
    "id" TEXT NOT NULL,
    "suiteId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvalSuiteKnowledge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KnowledgeGroup_workspaceId_idx" ON "KnowledgeGroup"("workspaceId");

-- CreateIndex
CREATE INDEX "KnowledgeGroup_parentId_idx" ON "KnowledgeGroup"("parentId");

-- CreateIndex
CREATE INDEX "KnowledgeGroup_workspaceId_sortOrder_idx" ON "KnowledgeGroup"("workspaceId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeGroup_workspaceId_parentId_name_key" ON "KnowledgeGroup"("workspaceId", "parentId", "name");

-- CreateIndex
CREATE INDEX "KnowledgeArticle_workspaceId_idx" ON "KnowledgeArticle"("workspaceId");

-- CreateIndex
CREATE INDEX "KnowledgeArticle_workspaceId_status_idx" ON "KnowledgeArticle"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "KnowledgeArticle_groupId_idx" ON "KnowledgeArticle"("groupId");

-- CreateIndex
CREATE INDEX "KnowledgeArticle_workspaceId_status_updatedAt_idx" ON "KnowledgeArticle"("workspaceId", "status", "updatedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeArticle_workspaceId_slug_key" ON "KnowledgeArticle"("workspaceId", "slug");

-- CreateIndex
CREATE INDEX "KnowledgeArticleVersion_articleId_createdAt_idx" ON "KnowledgeArticleVersion"("articleId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "KnowledgeArticleVersion_checksum_idx" ON "KnowledgeArticleVersion"("checksum");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeArticleVersion_articleId_version_key" ON "KnowledgeArticleVersion"("articleId", "version");

-- CreateIndex
CREATE INDEX "KnowledgeRule_workspaceId_enabled_idx" ON "KnowledgeRule"("workspaceId", "enabled");

-- CreateIndex
CREATE INDEX "KnowledgeRule_workspaceId_priority_idx" ON "KnowledgeRule"("workspaceId", "priority" DESC);

-- CreateIndex
CREATE INDEX "KnowledgeRule_projectId_idx" ON "KnowledgeRule"("projectId");

-- CreateIndex
CREATE INDEX "KnowledgeLink_workspaceId_idx" ON "KnowledgeLink"("workspaceId");

-- CreateIndex
CREATE INDEX "KnowledgeLink_articleId_idx" ON "KnowledgeLink"("articleId");

-- CreateIndex
CREATE INDEX "KnowledgeLink_entityType_entityId_idx" ON "KnowledgeLink"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeLink_articleId_entityType_entityId_key" ON "KnowledgeLink"("articleId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "KnowledgeAttachment_articleId_idx" ON "KnowledgeAttachment"("articleId");

-- CreateIndex
CREATE INDEX "KnowledgeAttachment_workspaceId_idx" ON "KnowledgeAttachment"("workspaceId");

-- CreateIndex
CREATE INDEX "KnowledgeChunk_articleId_idx" ON "KnowledgeChunk"("articleId");

-- CreateIndex
CREATE INDEX "KnowledgeChunk_workspaceId_idx" ON "KnowledgeChunk"("workspaceId");

-- CreateIndex
CREATE INDEX "KnowledgeChunk_contentHash_idx" ON "KnowledgeChunk"("contentHash");

-- CreateIndex
CREATE INDEX "KnowledgeChunk_sourceType_sourceId_idx" ON "KnowledgeChunk"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "AlertRCAKnowledge_rcaId_idx" ON "AlertRCAKnowledge"("rcaId");

-- CreateIndex
CREATE INDEX "AlertRCAKnowledge_articleId_idx" ON "AlertRCAKnowledge"("articleId");

-- CreateIndex
CREATE UNIQUE INDEX "AlertRCAKnowledge_rcaId_articleId_key" ON "AlertRCAKnowledge"("rcaId", "articleId");

-- CreateIndex
CREATE INDEX "EvalSuiteKnowledge_suiteId_idx" ON "EvalSuiteKnowledge"("suiteId");

-- CreateIndex
CREATE INDEX "EvalSuiteKnowledge_articleId_idx" ON "EvalSuiteKnowledge"("articleId");

-- CreateIndex
CREATE UNIQUE INDEX "EvalSuiteKnowledge_suiteId_articleId_key" ON "EvalSuiteKnowledge"("suiteId", "articleId");

-- AddForeignKey
ALTER TABLE "KnowledgeGroup" ADD CONSTRAINT "KnowledgeGroup_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeGroup" ADD CONSTRAINT "KnowledgeGroup_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "KnowledgeGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeArticle" ADD CONSTRAINT "KnowledgeArticle_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeArticle" ADD CONSTRAINT "KnowledgeArticle_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "KnowledgeGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeArticle" ADD CONSTRAINT "KnowledgeArticle_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeArticle" ADD CONSTRAINT "KnowledgeArticle_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeArticleVersion" ADD CONSTRAINT "KnowledgeArticleVersion_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "KnowledgeArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeArticleVersion" ADD CONSTRAINT "KnowledgeArticleVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeRule" ADD CONSTRAINT "KnowledgeRule_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeRule" ADD CONSTRAINT "KnowledgeRule_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeRule" ADD CONSTRAINT "KnowledgeRule_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "KnowledgeArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeRule" ADD CONSTRAINT "KnowledgeRule_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "KnowledgeGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeLink" ADD CONSTRAINT "KnowledgeLink_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeLink" ADD CONSTRAINT "KnowledgeLink_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "KnowledgeArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeLink" ADD CONSTRAINT "KnowledgeLink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeAttachment" ADD CONSTRAINT "KnowledgeAttachment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeAttachment" ADD CONSTRAINT "KnowledgeAttachment_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "KnowledgeArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeChunk" ADD CONSTRAINT "KnowledgeChunk_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "KnowledgeArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeChunk" ADD CONSTRAINT "KnowledgeChunk_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertRCAKnowledge" ADD CONSTRAINT "AlertRCAKnowledge_rcaId_fkey" FOREIGN KEY ("rcaId") REFERENCES "AlertRCA"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertRCAKnowledge" ADD CONSTRAINT "AlertRCAKnowledge_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "KnowledgeArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvalSuiteKnowledge" ADD CONSTRAINT "EvalSuiteKnowledge_suiteId_fkey" FOREIGN KEY ("suiteId") REFERENCES "EvalSuite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvalSuiteKnowledge" ADD CONSTRAINT "EvalSuiteKnowledge_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "KnowledgeArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
