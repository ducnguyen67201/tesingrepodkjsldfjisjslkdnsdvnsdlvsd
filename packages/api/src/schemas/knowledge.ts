/**
 * Knowledge Base Schemas
 *
 * Zod schemas for the workspace knowledge base - source of truth for types.
 */

import { z } from "zod";
import { formatFileSize } from "@cognobserve/shared";

// ============================================================
// Enums
// ============================================================

/**
 * Article status lifecycle
 */
export const ArticleStatusSchema = z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]);
export type ArticleStatus = z.infer<typeof ArticleStatusSchema>;

/**
 * All possible article statuses (derived from schema)
 */
export const ARTICLE_STATUSES = ArticleStatusSchema.options;

/**
 * Entity types that can be linked to knowledge articles
 */
export const KnowledgeEntityTypeSchema = z.enum([
  "PROJECT",
  "TRACE",
  "SPAN",
  "ALERT",
  "ALERT_HISTORY",
]);
export type KnowledgeEntityType = z.infer<typeof KnowledgeEntityTypeSchema>;

/**
 * Rule scope - workspace-wide or project-specific
 */
export const KnowledgeRuleScopeSchema = z.enum(["WORKSPACE", "PROJECT"]);
export type KnowledgeRuleScope = z.infer<typeof KnowledgeRuleScopeSchema>;

/**
 * Match type for RCA knowledge matches
 */
export const RuleMatchTypeSchema = z.enum(["DIRECT_LINK", "RULE", "SEMANTIC"]);
export type RuleMatchType = z.infer<typeof RuleMatchTypeSchema>;

/**
 * Chunk source type
 */
export const ChunkSourceTypeSchema = z.enum(["ARTICLE", "ATTACHMENT"]);
export type ChunkSourceType = z.infer<typeof ChunkSourceTypeSchema>;

// ============================================================
// Display Labels
// ============================================================

/**
 * Status labels for UI display
 */
export const ARTICLE_STATUS_LABELS: Record<ArticleStatus, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
};

/**
 * Entity type labels for UI display
 */
export const ENTITY_TYPE_LABELS: Record<KnowledgeEntityType, string> = {
  PROJECT: "Project",
  TRACE: "Trace",
  SPAN: "Span",
  ALERT: "Alert",
  ALERT_HISTORY: "Alert History",
};

/**
 * Match type labels for UI display
 */
export const MATCH_TYPE_LABELS: Record<RuleMatchType, string> = {
  DIRECT_LINK: "Linked",
  RULE: "Rule Match",
  SEMANTIC: "Similar",
};

// ============================================================
// Group Schemas
// ============================================================

export const CreateGroupInputSchema = z.object({
  workspaceSlug: z.string().min(1),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  parentId: z.string().optional(),
  sortOrder: z.number().int().min(0).optional(),
});
export type CreateGroupInput = z.infer<typeof CreateGroupInputSchema>;

export const UpdateGroupInputSchema = z.object({
  workspaceSlug: z.string().min(1),
  groupId: z.string().min(1),
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  parentId: z.string().optional().nullable(),
  sortOrder: z.number().int().min(0).optional(),
});
export type UpdateGroupInput = z.infer<typeof UpdateGroupInputSchema>;

export const DeleteGroupInputSchema = z.object({
  workspaceSlug: z.string().min(1),
  groupId: z.string().min(1),
  /** If true, move articles to parent group. If false, delete articles too. */
  preserveArticles: z.boolean().default(true),
});
export type DeleteGroupInput = z.infer<typeof DeleteGroupInputSchema>;

export const ListGroupsInputSchema = z.object({
  workspaceSlug: z.string().min(1),
  flat: z.boolean().default(false),
});
export type ListGroupsInput = z.infer<typeof ListGroupsInputSchema>;

// ============================================================
// Article Schemas
// ============================================================

export const CreateArticleInputSchema = z.object({
  workspaceSlug: z.string().min(1),
  groupId: z.string().optional(),
  title: z.string().min(1).max(200),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  summary: z.string().max(500).optional(),
  content: z.string().min(1).max(100000), // ~100KB limit
  tags: z.array(z.string().max(50)).max(20).default([]),
  status: ArticleStatusSchema.default("DRAFT"),
});
export type CreateArticleInput = z.infer<typeof CreateArticleInputSchema>;

export const UpdateArticleInputSchema = z.object({
  workspaceSlug: z.string().min(1),
  articleId: z.string().min(1),
  groupId: z.string().optional().nullable(),
  title: z.string().min(1).max(200).optional(),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  summary: z.string().max(500).optional().nullable(),
  content: z.string().min(1).max(100000).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
});
export type UpdateArticleInput = z.infer<typeof UpdateArticleInputSchema>;

export const PublishArticleInputSchema = z.object({
  workspaceSlug: z.string().min(1),
  articleId: z.string().min(1),
});
export type PublishArticleInput = z.infer<typeof PublishArticleInputSchema>;

export const ArchiveArticleInputSchema = z.object({
  workspaceSlug: z.string().min(1),
  articleId: z.string().min(1),
  archive: z.boolean().default(true),
});
export type ArchiveArticleInput = z.infer<typeof ArchiveArticleInputSchema>;

export const ListArticlesInputSchema = z.object({
  workspaceSlug: z.string().min(1),
  groupId: z.string().optional(),
  status: ArticleStatusSchema.optional(),
  tags: z.array(z.string()).optional(),
  query: z.string().optional(),
  limit: z.number().min(1).max(100).default(50),
  cursor: z.string().optional(),
});
export type ListArticlesInput = z.infer<typeof ListArticlesInputSchema>;

export const GetArticleInputSchema = z.object({
  workspaceSlug: z.string().min(1),
  articleId: z.string().min(1),
});
export type GetArticleInput = z.infer<typeof GetArticleInputSchema>;

// ============================================================
// Version Schemas
// ============================================================

export const ListVersionsInputSchema = z.object({
  workspaceSlug: z.string().min(1),
  articleId: z.string().min(1),
  limit: z.number().min(1).max(50).default(20),
  cursor: z.string().optional(),
});
export type ListVersionsInput = z.infer<typeof ListVersionsInputSchema>;

export const GetVersionInputSchema = z.object({
  workspaceSlug: z.string().min(1),
  articleId: z.string().min(1),
  version: z.number().int().min(1),
});
export type GetVersionInput = z.infer<typeof GetVersionInputSchema>;

export const RevertToVersionInputSchema = z.object({
  workspaceSlug: z.string().min(1),
  articleId: z.string().min(1),
  version: z.number().int().min(1),
});
export type RevertToVersionInput = z.infer<typeof RevertToVersionInputSchema>;

export const CompareVersionsInputSchema = z.object({
  workspaceSlug: z.string().min(1),
  articleId: z.string().min(1),
  fromVersion: z.number().int().min(1),
  toVersion: z.number().int().min(1),
});
export type CompareVersionsInput = z.infer<typeof CompareVersionsInputSchema>;

// ============================================================
// Attachment Schemas
// ============================================================

export const UploadAttachmentInputSchema = z.object({
  workspaceSlug: z.string().min(1),
  articleId: z.string().min(1),
  fileName: z.string().min(1).max(255),
  contentType: z.string().min(1),
  sizeBytes: z.number().int().min(1).max(10 * 1024 * 1024), // 10MB max
});
export type UploadAttachmentInput = z.infer<typeof UploadAttachmentInputSchema>;

export const DeleteAttachmentInputSchema = z.object({
  workspaceSlug: z.string().min(1),
  attachmentId: z.string().min(1),
});
export type DeleteAttachmentInput = z.infer<typeof DeleteAttachmentInputSchema>;

export const ListAttachmentsInputSchema = z.object({
  workspaceSlug: z.string().min(1),
  articleId: z.string().min(1),
});
export type ListAttachmentsInput = z.infer<typeof ListAttachmentsInputSchema>;

// ============================================================
// Search Schemas
// ============================================================

export const SearchKnowledgeInputSchema = z.object({
  workspaceSlug: z.string().min(1),
  query: z.string().min(1).max(500),
  /** "keyword" for text search, "semantic" for embedding search, "hybrid" for both */
  mode: z.enum(["keyword", "semantic", "hybrid"]).default("hybrid"),
  status: ArticleStatusSchema.optional(),
  groupId: z.string().optional(),
  tags: z.array(z.string()).optional(),
  limit: z.number().min(1).max(50).default(10),
});
export type SearchKnowledgeInput = z.infer<typeof SearchKnowledgeInputSchema>;

export const SearchResultSchema = z.object({
  articleId: z.string(),
  title: z.string(),
  slug: z.string(),
  summary: z.string().nullable(),
  excerpt: z.string(),
  score: z.number(),
  matchType: z.enum(["keyword", "semantic"]),
  tags: z.array(z.string()),
  groupId: z.string().nullable(),
  groupName: z.string().nullable(),
});
export type SearchResult = z.infer<typeof SearchResultSchema>;

// ============================================================
// Link Schemas
// ============================================================

export const LinkEntityInputSchema = z.object({
  workspaceSlug: z.string().min(1),
  articleId: z.string().min(1),
  entityType: KnowledgeEntityTypeSchema,
  entityId: z.string().min(1),
  note: z.string().max(1000).optional(),
});
export type LinkEntityInput = z.infer<typeof LinkEntityInputSchema>;

export const UnlinkEntityInputSchema = z.object({
  workspaceSlug: z.string().min(1),
  articleId: z.string().min(1),
  entityType: KnowledgeEntityTypeSchema,
  entityId: z.string().min(1),
});
export type UnlinkEntityInput = z.infer<typeof UnlinkEntityInputSchema>;

export const ListLinksInputSchema = z.object({
  workspaceSlug: z.string().min(1),
  articleId: z.string().optional(),
  entityType: KnowledgeEntityTypeSchema.optional(),
  entityId: z.string().optional(),
  limit: z.number().min(1).max(100).default(50),
});
export type ListLinksInput = z.infer<typeof ListLinksInputSchema>;

// ============================================================
// Rule Schemas
// ============================================================

export const UpsertRuleInputSchema = z
  .object({
    workspaceSlug: z.string().min(1),
    ruleId: z.string().optional(), // If provided, update; otherwise create
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    enabled: z.boolean().default(true),
    priority: z.number().int().min(0).max(1000).default(0),
    scope: KnowledgeRuleScopeSchema.default("WORKSPACE"),
    projectId: z.string().optional(), // Required if scope = PROJECT
    condition: z.record(z.string(), z.unknown()), // FilterExpression DSL (JSON)
    /** Exactly one of articleId or groupId must be provided */
    articleId: z.string().optional(),
    groupId: z.string().optional(),
    matchReasonTemplate: z.string().max(500).optional(),
  })
  .refine(
    (data) =>
      (data.articleId && !data.groupId) || (!data.articleId && data.groupId),
    { message: "Exactly one of articleId or groupId must be provided" }
  )
  .refine((data) => data.scope !== "PROJECT" || data.projectId, {
    message: "projectId is required when scope is PROJECT",
  });
export type UpsertRuleInput = z.infer<typeof UpsertRuleInputSchema>;

export const DeleteRuleInputSchema = z.object({
  workspaceSlug: z.string().min(1),
  ruleId: z.string().min(1),
});
export type DeleteRuleInput = z.infer<typeof DeleteRuleInputSchema>;

export const PreviewRuleInputSchema = z.object({
  workspaceSlug: z.string().min(1),
  projectId: z.string().optional(),
  condition: z.record(z.string(), z.unknown()), // FilterExpression DSL
  limit: z.number().min(1).max(20).default(10),
});
export type PreviewRuleInput = z.infer<typeof PreviewRuleInputSchema>;

export const ListRulesInputSchema = z.object({
  workspaceSlug: z.string().min(1),
  projectId: z.string().optional(),
  enabled: z.boolean().optional(),
  limit: z.number().min(1).max(100).default(50),
});
export type ListRulesInput = z.infer<typeof ListRulesInputSchema>;

// ============================================================
// Stats Schemas
// ============================================================

export const KnowledgeStatsInputSchema = z.object({
  workspaceSlug: z.string().min(1),
  articleId: z.string().optional(),
});
export type KnowledgeStatsInput = z.infer<typeof KnowledgeStatsInputSchema>;

export const KnowledgeStatsOutputSchema = z.object({
  totalArticles: z.number(),
  publishedArticles: z.number(),
  draftArticles: z.number(),
  archivedArticles: z.number(),
  totalGroups: z.number(),
  totalRules: z.number(),
  enabledRules: z.number(),
  totalLinks: z.number(),
  totalViews: z.number(),
  recentMatches: z.number(), // RCA matches in last 30 days
});
export type KnowledgeStatsOutput = z.infer<typeof KnowledgeStatsOutputSchema>;

// ============================================================
// Feedback Schemas
// ============================================================

export const ArticleFeedbackInputSchema = z.object({
  workspaceSlug: z.string().min(1),
  articleId: z.string().min(1),
  helpful: z.boolean(),
});
export type ArticleFeedbackInput = z.infer<typeof ArticleFeedbackInputSchema>;

// ============================================================
// Internal Schemas (for Temporal activities)
// ============================================================

export const StoreKnowledgeChunksInputSchema = z.object({
  articleId: z.string().min(1),
  workspaceId: z.string().min(1),
  chunks: z.array(
    z.object({
      content: z.string(),
      contentHash: z.string(),
      startOffset: z.number().int(),
      endOffset: z.number().int(),
      sectionTitle: z.string().optional(),
      sourceType: ChunkSourceTypeSchema.default("ARTICLE"),
      sourceId: z.string().optional(),
    })
  ),
});
export type StoreKnowledgeChunksInput = z.infer<
  typeof StoreKnowledgeChunksInputSchema
>;

export const StoreKnowledgeEmbeddingsInputSchema = z.object({
  embeddings: z.array(
    z.object({
      chunkId: z.string(),
      embedding: z.array(z.number()),
    })
  ),
});
export type StoreKnowledgeEmbeddingsInput = z.infer<
  typeof StoreKnowledgeEmbeddingsInputSchema
>;

export const ReindexArticleInputSchema = z.object({
  articleId: z.string().min(1),
});
export type ReindexArticleInput = z.infer<typeof ReindexArticleInputSchema>;

export const ExtractAttachmentTextInputSchema = z.object({
  attachmentId: z.string().min(1),
  extractedText: z.string(),
});
export type ExtractAttachmentTextInput = z.infer<
  typeof ExtractAttachmentTextInputSchema
>;

export const FindMatchingKnowledgeInputSchema = z.object({
  workspaceId: z.string().min(1),
  projectId: z.string().min(1),
  alertId: z.string().min(1),
  alertHistoryId: z.string().optional(),
  /** Query built from RCA trace analysis, error patterns */
  semanticQuery: z.string().min(1).max(2000),
  /** Context for rule evaluation */
  traceContext: z.record(z.string(), z.unknown()).optional(),
  limit: z.number().min(1).max(10).default(5),
});
export type FindMatchingKnowledgeInput = z.infer<
  typeof FindMatchingKnowledgeInputSchema
>;

export const MatchedArticleSchema = z.object({
  articleId: z.string(),
  title: z.string(),
  summary: z.string().nullable(),
  excerpt: z.string(),
  matchType: RuleMatchTypeSchema,
  matchScore: z.number().nullable(),
  matchReason: z.string().nullable(),
  ruleName: z.string().nullable(),
});
export type MatchedArticle = z.infer<typeof MatchedArticleSchema>;

export const StoreRCAKnowledgeMatchesInputSchema = z.object({
  rcaId: z.string().min(1),
  matches: z.array(
    z.object({
      articleId: z.string(),
      matchType: RuleMatchTypeSchema,
      matchScore: z.number().nullable(),
      matchReason: z.string().nullable(),
      snapshotTitle: z.string(),
      snapshotExcerpt: z.string().nullable(),
    })
  ),
});
export type StoreRCAKnowledgeMatchesInput = z.infer<
  typeof StoreRCAKnowledgeMatchesInputSchema
>;

// ============================================================
// Constants
// ============================================================

export const KNOWLEDGE_LIMITS = {
  MAX_ARTICLE_CONTENT_LENGTH: 100000,
  MAX_CHUNK_SIZE: 1500, // Tokens per chunk
  MAX_CHUNKS_PER_ARTICLE: 100,
  MAX_TAGS_PER_ARTICLE: 20,
  MAX_ATTACHMENTS_PER_ARTICLE: 10,
  MAX_ATTACHMENT_SIZE_BYTES: 10 * 1024 * 1024, // 10MB
  SEMANTIC_SEARCH_TOP_K: 20,
  RCA_CONTEXT_MAX_ARTICLES: 5,
  RCA_CONTEXT_MAX_EXCERPTS_PER_ARTICLE: 2,
} as const;

/**
 * Supported attachment content types for text extraction
 */
export const EXTRACTABLE_CONTENT_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
] as const;

/**
 * Check if content type supports text extraction
 */
export function isExtractableContentType(contentType: string): boolean {
  return EXTRACTABLE_CONTENT_TYPES.includes(
    contentType as (typeof EXTRACTABLE_CONTENT_TYPES)[number]
  );
}

// Re-export formatFileSize from shared utils for convenience
export { formatFileSize };
