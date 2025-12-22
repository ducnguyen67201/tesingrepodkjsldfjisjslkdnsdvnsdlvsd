# Workspace Knowledge Base (RCA Context)

Status: Draft
Owner: Platform Observability
Last updated: 2025-02-14

## Summary

Create a workspace-level knowledge base (KB) for rules, runbooks, and domain knowledge that can be attached to projects, traces, alerts, and RCA results. The KB enriches RCA by providing curated context and auto-matched guidance when incidents happen.

## Goals

- Central place for runbooks, known issues, and operational rules.
- Link knowledge to projects, traces, alerts, and alert history.
- Auto-match knowledge during RCA with explainable reasons.
- Support keyword and semantic search across KB content.
- Surface matched knowledge in RCA detail and trace detail views.

## Non-goals

- External sync (Jira, Confluence, Slack, Notion).
- OCR or file ingestion beyond basic attachments.
- Cross-workspace sharing or public KB publishing.

## Users and Permissions

- Workspace admins: create, edit, publish, archive, delete.
- Members: view, search, attach, and provide feedback.
- View access is always scoped to workspace membership.

## Core Concepts

- Groups: hierarchical folders for organizing articles.
- Articles: the main KB content (draft or published).
- Rules: auto-association logic for RCA and traces.
- Links: explicit connections to project/trace/alert/history.
- Chunks: text slices of articles for semantic search.

## Data Model (Proposed)

Workspace
  - KnowledgeGroup
  - KnowledgeArticle
  - KnowledgeRule
  - KnowledgeLink
  - KnowledgeAttachment
  - KnowledgeChunk
  - AlertRCAKnowledge (optional join for RCA snapshot)

### KnowledgeGroup

- id, workspaceId, name, parentId, sortOrder, createdAt, updatedAt

### KnowledgeArticle

- id, workspaceId, groupId, title, slug, summary
- content (markdown), tags[], status (DRAFT, PUBLISHED, ARCHIVED)
- createdById, updatedById, createdAt, updatedAt
- searchText (denormalized)

### KnowledgeRule

- id, workspaceId, name, enabled, priority
- scope: workspace or project
- condition: FilterExpression DSL or structured matcher
- target: articleId or groupId
- matchReasonTemplate

### KnowledgeLink

- id, workspaceId, articleId
- entityType: PROJECT | TRACE | SPAN | ALERT | ALERT_HISTORY
- entityId
- createdById, createdAt

### KnowledgeAttachment

- id, workspaceId, articleId
- fileName, contentType, sizeBytes, storageKey, createdAt

### KnowledgeChunk

- id, articleId, workspaceId
- content, contentHash, startOffset, endOffset
- embedding (vector(1536))

### AlertRCAKnowledge (optional)

- id, rcaId, articleId, matchType, matchScore, matchReason
- snapshotTitle, snapshotExcerpt

## Indexing and Search

### Indexing Pipeline

- On publish or update:
  1. Chunk article content (preserve headings and code blocks).
  2. Generate embeddings per chunk (LLM Center).
  3. Store embeddings in pgvector.
  4. Update searchText for keyword search.

### Query Inputs

- Keyword search: title, tags, summary, searchText.
- Semantic search: query built from RCA trace analysis, error patterns, and endpoints.

### Ranking Strategy

- Direct links (entity-specific) rank highest.
- Rule matches rank next (by priority and confidence).
- Semantic matches rank last (by similarity score).
- Cap results (example: top 5 articles, top 2 excerpts each).

## RCA Integration

### Retrieval Flow

- During RCA workflow:
  1. Fetch direct links for alert, project, and alert history.
  2. Evaluate enabled rules against trace analysis output.
  3. Run semantic search using aggregated query.
  4. Merge and rank results.
  5. Attach to RCA prompt context.
  6. Persist references for RCA detail view.

### Prompt Context (RCA)

Include a Knowledge Context block with:
- Article title
- Short summary or excerpt
- Match reason (rule name, direct link, semantic score)
- Links for deeper reading

## Trace Detail Integration

- Show a Knowledge section in trace detail panel:
  - Directly linked articles
  - Suggested articles (rule + semantic)
  - Quick link/unlink actions

## UI Surface (Web)

### Workspace Knowledge Base

- Route: /workspace/[workspaceSlug]/knowledge
- Left: group tree + search
- Middle: article list and filters
- Right: article detail + metadata + attachments
- Actions: create, edit, publish, archive, delete

### RCA Detail

- Add Knowledge card with matched articles and reasons.
- Allow linking back to KB article and rule source.

### Trace Detail

- Add Knowledge section for trace-specific guidance.

## APIs (tRPC)

knowledge.
- listGroups, createGroup, updateGroup, deleteGroup
- listArticles, getArticle, createArticle, updateArticle, publishArticle, archiveArticle
- search (keyword + semantic)
- linkEntity, unlinkEntity, listLinks
- upsertRule, deleteRule, previewRule
- stats (views, helpfulness, match counts)

internal.
- storeKnowledgeEmbeddings
- reindexKnowledgeArticle

## Metrics and Auditability

- Track article views, helpfulness, and last viewed.
- Track rule match counts and RCA usage.
- Store edit history (basic audit log or versioning later).

## Rollout Plan

1. Data model + CRUD + basic UI (manual linking only).
2. Indexing + semantic search.
3. Rules engine + preview UI.
4. RCA and trace integrations.

## Open Questions

- Do we need full article versioning or just audit logs?
- Should rules use the existing FilterExpression DSL or a simpler UI builder?
- Should attachments be indexed or excluded from semantic search?

