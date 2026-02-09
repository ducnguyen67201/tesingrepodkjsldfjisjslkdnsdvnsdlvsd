-- Convert embedding columns from jsonb to native pgvector type
-- This is required because vector.ts uses ::vector casting in raw SQL

-- Ensure pgvector extension exists
CREATE EXTENSION IF NOT EXISTS vector;

-- CodeChunk: Drop jsonb column and recreate as vector(1536)
ALTER TABLE "CodeChunk" DROP COLUMN IF EXISTS "embedding";
ALTER TABLE "CodeChunk" ADD COLUMN "embedding" vector(1536);

-- KnowledgeChunk: Drop jsonb column and recreate as vector(1536)
ALTER TABLE "KnowledgeChunk" DROP COLUMN IF EXISTS "embedding";
ALTER TABLE "KnowledgeChunk" ADD COLUMN "embedding" vector(1536);
