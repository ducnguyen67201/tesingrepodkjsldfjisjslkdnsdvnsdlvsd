-- ============================================================
-- Prompt Management Models
-- ============================================================

-- CreateTable
CREATE TABLE "Prompt" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "Prompt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromptVersion" (
    "id" TEXT NOT NULL,
    "promptId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "variables" JSONB,
    "config" JSONB,
    "metadata" JSONB,
    "searchText" TEXT,
    "checksum" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromptVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromptLabel" (
    "id" TEXT NOT NULL,
    "promptId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "PromptLabel_pkey" PRIMARY KEY ("id")
);

-- ============================================================
-- Prompt A/B Experiment Models
-- ============================================================

-- CreateTable
CREATE TABLE "PromptExperiment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "allocationPct" INTEGER NOT NULL DEFAULT 100,
    "assignmentSeed" TEXT NOT NULL,
    "assignmentKey" TEXT NOT NULL DEFAULT 'userId',
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "metrics" JSONB,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "analysisStatus" TEXT,
    "analysisStartedAt" TIMESTAMP(3),
    "analysisCompletedAt" TIMESTAMP(3),
    "analysisResult" JSONB,
    "analysisError" TEXT,
    "winnerVariantId" TEXT,
    "winnerConfidence" DOUBLE PRECISION,

    CONSTRAINT "PromptExperiment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromptExperimentVariant" (
    "id" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "weight" INTEGER NOT NULL,
    "promptVersionId" TEXT NOT NULL,
    "isControl" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromptExperimentVariant_pkey" PRIMARY KEY ("id")
);

-- ============================================================
-- Span Experiment Tracking Columns
-- ============================================================

-- AlterTable: Add experiment tracking columns to Span
ALTER TABLE "Span" ADD COLUMN IF NOT EXISTS "promptExperimentId" TEXT;
ALTER TABLE "Span" ADD COLUMN IF NOT EXISTS "promptExperimentSlug" TEXT;
ALTER TABLE "Span" ADD COLUMN IF NOT EXISTS "promptVariantId" TEXT;
ALTER TABLE "Span" ADD COLUMN IF NOT EXISTS "promptVariantName" TEXT;
ALTER TABLE "Span" ADD COLUMN IF NOT EXISTS "assignmentKeyHash" TEXT;
ALTER TABLE "Span" ADD COLUMN IF NOT EXISTS "promptVersionId" TEXT;

-- ============================================================
-- Indexes
-- ============================================================

-- Prompt indexes
CREATE UNIQUE INDEX IF NOT EXISTS "Prompt_projectId_slug_key" ON "Prompt"("projectId", "slug");
CREATE INDEX IF NOT EXISTS "Prompt_projectId_isArchived_idx" ON "Prompt"("projectId", "isArchived");
CREATE INDEX IF NOT EXISTS "Prompt_projectId_name_idx" ON "Prompt"("projectId", "name");

-- PromptVersion indexes
CREATE UNIQUE INDEX IF NOT EXISTS "PromptVersion_promptId_version_key" ON "PromptVersion"("promptId", "version");
CREATE INDEX IF NOT EXISTS "PromptVersion_promptId_createdAt_idx" ON "PromptVersion"("promptId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "PromptVersion_checksum_idx" ON "PromptVersion"("checksum");

-- PromptLabel indexes
CREATE UNIQUE INDEX IF NOT EXISTS "PromptLabel_promptId_name_key" ON "PromptLabel"("promptId", "name");
CREATE INDEX IF NOT EXISTS "PromptLabel_versionId_idx" ON "PromptLabel"("versionId");

-- PromptExperiment indexes
CREATE UNIQUE INDEX IF NOT EXISTS "PromptExperiment_projectId_slug_key" ON "PromptExperiment"("projectId", "slug");
CREATE INDEX IF NOT EXISTS "PromptExperiment_projectId_status_idx" ON "PromptExperiment"("projectId", "status");
CREATE INDEX IF NOT EXISTS "PromptExperiment_projectId_createdAt_idx" ON "PromptExperiment"("projectId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "PromptExperiment_analysisStatus_idx" ON "PromptExperiment"("analysisStatus");

-- PromptExperimentVariant indexes
CREATE UNIQUE INDEX IF NOT EXISTS "PromptExperimentVariant_experimentId_name_key" ON "PromptExperimentVariant"("experimentId", "name");
CREATE INDEX IF NOT EXISTS "PromptExperimentVariant_promptVersionId_idx" ON "PromptExperimentVariant"("promptVersionId");

-- Span experiment tracking indexes
CREATE INDEX IF NOT EXISTS "Span_promptVersionId_idx" ON "Span"("promptVersionId");
CREATE INDEX IF NOT EXISTS "Span_promptVariantId_idx" ON "Span"("promptVariantId");

-- ============================================================
-- Foreign Keys
-- ============================================================

-- Prompt foreign keys
ALTER TABLE "Prompt" ADD CONSTRAINT "Prompt_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- PromptVersion foreign keys
ALTER TABLE "PromptVersion" ADD CONSTRAINT "PromptVersion_promptId_fkey" FOREIGN KEY ("promptId") REFERENCES "Prompt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- PromptLabel foreign keys
ALTER TABLE "PromptLabel" ADD CONSTRAINT "PromptLabel_promptId_fkey" FOREIGN KEY ("promptId") REFERENCES "Prompt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromptLabel" ADD CONSTRAINT "PromptLabel_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "PromptVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- PromptExperiment foreign keys
ALTER TABLE "PromptExperiment" ADD CONSTRAINT "PromptExperiment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- PromptExperimentVariant foreign keys
ALTER TABLE "PromptExperimentVariant" ADD CONSTRAINT "PromptExperimentVariant_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "PromptExperiment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromptExperimentVariant" ADD CONSTRAINT "PromptExperimentVariant_promptVersionId_fkey" FOREIGN KEY ("promptVersionId") REFERENCES "PromptVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
