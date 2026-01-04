-- ============================================================================
-- Migration: Add GIN Trigram Indexes for Free-Text Search
-- ============================================================================
--
-- Problem: Free-text search on searchText columns causes full table scans
--          because ILIKE '%query%' cannot use B-tree indexes.
--
-- Solution: Use PostgreSQL's pg_trgm extension with GIN indexes.
--           GIN trigram indexes break text into 3-character sequences (trigrams)
--           and can efficiently match ILIKE patterns.
--
-- Performance: Queries like `WHERE searchText ILIKE '%llm%'` will use the index
--              instead of scanning every row.
-- ============================================================================

-- Enable pg_trgm extension for trigram-based text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Add GIN trigram index on Trace.searchText for fast free-text search
-- This accelerates queries like: WHERE "searchText" ILIKE '%query%'
CREATE INDEX IF NOT EXISTS "Trace_searchText_idx"
ON "Trace" USING gin ("searchText" gin_trgm_ops);

-- Add GIN trigram index on Span.searchText for fast free-text search
CREATE INDEX IF NOT EXISTS "Span_searchText_idx"
ON "Span" USING gin ("searchText" gin_trgm_ops);

-- Add GIN trigram index on LogRecord.bodyText for fast log search
CREATE INDEX IF NOT EXISTS "LogRecord_bodyText_idx"
ON "LogRecord" USING gin ("bodyText" gin_trgm_ops);
