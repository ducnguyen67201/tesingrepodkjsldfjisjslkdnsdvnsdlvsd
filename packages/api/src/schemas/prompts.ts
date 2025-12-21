/**
 * Prompt Management Schemas
 *
 * Zod schemas for the prompt registry system - source of truth for types.
 * Supports versioning, labels, and runtime SDK retrieval.
 */

import { z } from "zod";

// ============================================================
// Prompt Type
// ============================================================

/**
 * Prompt template type - text or chat
 */
export const PromptTypeSchema = z.enum(["text", "chat"]);
export type PromptType = z.infer<typeof PromptTypeSchema>;

/**
 * Type labels for UI display
 */
export const PROMPT_TYPE_LABELS: Record<PromptType, string> = {
  text: "Text",
  chat: "Chat",
};

// ============================================================
// Prompt Label
// ============================================================

/**
 * Prompt label names - used for version targeting
 */
export const PromptLabelNameSchema = z.enum(["production", "staging", "latest"]);
export type PromptLabelName = z.infer<typeof PromptLabelNameSchema>;

/**
 * Label labels for UI display
 */
export const PROMPT_LABEL_LABELS: Record<PromptLabelName, string> = {
  production: "Production",
  staging: "Staging",
  latest: "Latest",
};

/**
 * Label colors for UI
 */
export const PROMPT_LABEL_COLORS: Record<PromptLabelName, string> = {
  production: "bg-green-100 text-green-800",
  staging: "bg-yellow-100 text-yellow-800",
  latest: "bg-blue-100 text-blue-800",
};

// ============================================================
// Chat Message Schema
// ============================================================

/**
 * Chat message role
 */
export const ChatMessageRoleSchema = z.enum([
  "system",
  "user",
  "assistant",
  "tool",
]);
export type ChatMessageRole = z.infer<typeof ChatMessageRoleSchema>;

/**
 * Single chat message
 */
export const ChatMessageSchema = z.object({
  role: ChatMessageRoleSchema,
  content: z.string(),
  name: z.string().optional(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

// ============================================================
// Prompt Template Schema
// ============================================================

/**
 * Text template - simple string with {{variable}} placeholders
 */
export const TextTemplateSchema = z.object({
  type: z.literal("text"),
  text: z.string().min(1, "Template text is required"),
});
export type TextTemplate = z.infer<typeof TextTemplateSchema>;

/**
 * Chat template - array of messages with {{variable}} placeholders
 */
export const ChatTemplateSchema = z.object({
  type: z.literal("chat"),
  messages: z.array(ChatMessageSchema).min(1, "At least one message is required"),
});
export type ChatTemplate = z.infer<typeof ChatTemplateSchema>;

/**
 * Prompt template - discriminated union of text and chat
 */
export const PromptTemplateSchema = z.discriminatedUnion("type", [
  TextTemplateSchema,
  ChatTemplateSchema,
]);
export type PromptTemplate = z.infer<typeof PromptTemplateSchema>;

// ============================================================
// Prompt Variable Schema
// ============================================================

/**
 * Variable definition - used for template compilation
 */
export const PromptVariableSchema = z.object({
  /** Variable name (used in {{name}} placeholders) */
  name: z.string().min(1, "Variable name is required"),
  /** Whether the variable is required */
  required: z.boolean().default(true),
  /** Default value if not provided */
  default: z.string().optional(),
  /** Description for documentation */
  description: z.string().optional(),
});
export type PromptVariable = z.infer<typeof PromptVariableSchema>;

// ============================================================
// Prompt Config Schema
// ============================================================

/**
 * Model configuration - passed to LLM when using the prompt
 */
export const PromptConfigSchema = z
  .object({
    /** Model identifier (e.g., "gpt-4", "claude-3-opus") */
    model: z.string().optional(),
    /** Temperature (0-2) */
    temperature: z.number().min(0).max(2).optional(),
    /** Max tokens to generate */
    maxTokens: z.number().positive().optional(),
    /** Top P sampling */
    topP: z.number().min(0).max(1).optional(),
    /** Frequency penalty */
    frequencyPenalty: z.number().min(-2).max(2).optional(),
    /** Presence penalty */
    presencePenalty: z.number().min(-2).max(2).optional(),
    /** Stop sequences */
    stop: z.array(z.string()).optional(),
  })
  .passthrough();
export type PromptConfig = z.infer<typeof PromptConfigSchema>;

// ============================================================
// CRUD Input Schemas
// ============================================================

/**
 * Create prompt input
 */
export const CreatePromptInputSchema = z.object({
  workspaceSlug: z.string().min(1),
  projectId: z.string().min(1),
  name: z.string().min(1, "Name is required").max(100, "Name too long"),
  slug: z
    .string()
    .min(1, "Slug is required")
    .max(50, "Slug too long")
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  description: z.string().max(500).optional(),
  tags: z.array(z.string()).default([]),
  template: PromptTemplateSchema,
  variables: z.array(PromptVariableSchema).optional(),
  config: PromptConfigSchema.optional(),
  labels: z.array(PromptLabelNameSchema).optional(),
});
export type CreatePromptInput = z.infer<typeof CreatePromptInputSchema>;

/**
 * Update prompt input (metadata only, not versions)
 */
export const UpdatePromptInputSchema = z.object({
  workspaceSlug: z.string().min(1),
  promptId: z.string().min(1),
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  tags: z.array(z.string()).optional(),
});
export type UpdatePromptInput = z.infer<typeof UpdatePromptInputSchema>;

/**
 * Create version input
 */
export const CreateVersionInputSchema = z.object({
  workspaceSlug: z.string().min(1),
  promptId: z.string().min(1),
  template: PromptTemplateSchema,
  variables: z.array(PromptVariableSchema).optional(),
  config: PromptConfigSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  /** Optionally set label for this version */
  label: PromptLabelNameSchema.optional(),
});
export type CreateVersionInput = z.infer<typeof CreateVersionInputSchema>;

/**
 * Set label input
 */
export const SetLabelInputSchema = z.object({
  workspaceSlug: z.string().min(1),
  promptId: z.string().min(1),
  versionId: z.string().min(1),
  label: PromptLabelNameSchema,
});
export type SetLabelInput = z.infer<typeof SetLabelInputSchema>;

/**
 * Archive prompt input
 */
export const ArchivePromptInputSchema = z.object({
  workspaceSlug: z.string().min(1),
  promptId: z.string().min(1),
  archive: z.boolean().default(true),
});
export type ArchivePromptInput = z.infer<typeof ArchivePromptInputSchema>;

// ============================================================
// Query Input Schemas
// ============================================================

/**
 * List prompts input
 */
export const ListPromptsInputSchema = z.object({
  workspaceSlug: z.string().min(1),
  projectId: z.string().min(1),
  query: z.string().optional(),
  tags: z.array(z.string()).optional(),
  label: PromptLabelNameSchema.optional(),
  includeArchived: z.boolean().default(false),
  limit: z.number().min(1).max(100).default(50),
  cursor: z.string().optional(),
});
export type ListPromptsInput = z.infer<typeof ListPromptsInputSchema>;

/**
 * Get prompt input
 */
export const GetPromptInputSchema = z.object({
  workspaceSlug: z.string().min(1),
  promptId: z.string().min(1),
});
export type GetPromptInput = z.infer<typeof GetPromptInputSchema>;

/**
 * Search prompts input - for grep across content
 */
export const SearchPromptsInputSchema = z.object({
  workspaceSlug: z.string().min(1),
  projectId: z.string().min(1),
  query: z.string().min(1, "Search query is required"),
  tags: z.array(z.string()).optional(),
  labels: z.array(PromptLabelNameSchema).optional(),
  type: PromptTypeSchema.optional(),
  includeVersions: z.boolean().default(false),
  limit: z.number().min(1).max(100).default(20),
});
export type SearchPromptsInput = z.infer<typeof SearchPromptsInputSchema>;

// ============================================================
// Import/Export Schemas
// ============================================================

/**
 * Import format
 */
export const ImportFormatSchema = z.enum(["json", "yaml", "external"]);
export type ImportFormat = z.infer<typeof ImportFormatSchema>;

/**
 * Single prompt for import
 */
export const ImportPromptSchema = z.object({
  name: z.string().min(1),
  slug: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  template: PromptTemplateSchema,
  variables: z.array(PromptVariableSchema).optional(),
  config: PromptConfigSchema.optional(),
});
export type ImportPrompt = z.infer<typeof ImportPromptSchema>;

/**
 * Import prompts input
 */
export const ImportPromptsInputSchema = z.object({
  workspaceSlug: z.string().min(1),
  projectId: z.string().min(1),
  format: ImportFormatSchema,
  prompts: z.array(ImportPromptSchema).min(1),
  options: z
    .object({
      /** Overwrite existing prompts with same slug */
      overwrite: z.boolean().default(false),
      /** Create new versions for existing prompts */
      createVersions: z.boolean().default(true),
    })
    .optional(),
});
export type ImportPromptsInput = z.infer<typeof ImportPromptsInputSchema>;

/**
 * Export prompts input
 */
export const ExportPromptsInputSchema = z.object({
  workspaceSlug: z.string().min(1),
  projectId: z.string().min(1),
  promptIds: z.array(z.string()).optional(),
  format: ImportFormatSchema.default("json"),
  includeAllVersions: z.boolean().default(false),
});
export type ExportPromptsInput = z.infer<typeof ExportPromptsInputSchema>;

// ============================================================
// SDK Fetch Schema (Public API)
// ============================================================

/**
 * SDK fetch options - used by public API
 */
export const FetchPromptOptionsSchema = z.object({
  /** Label to fetch (production, staging, latest) */
  label: PromptLabelNameSchema.optional(),
  /** Specific version number to fetch */
  version: z.number().int().positive().optional(),
  /** Filter by type */
  type: PromptTypeSchema.optional(),
});
export type FetchPromptOptions = z.infer<typeof FetchPromptOptionsSchema>;

/**
 * SDK fetch response
 */
export const FetchPromptResponseSchema = z.object({
  id: z.string(),
  promptId: z.string(),
  name: z.string(),
  slug: z.string(),
  version: z.number(),
  type: PromptTypeSchema,
  content: PromptTemplateSchema,
  variables: z.array(PromptVariableSchema).nullable(),
  config: PromptConfigSchema.nullable(),
  checksum: z.string(),
  label: PromptLabelNameSchema.nullable(),
});
export type FetchPromptResponse = z.infer<typeof FetchPromptResponseSchema>;

// ============================================================
// Playground Schemas
// ============================================================

/**
 * Run playground input
 */
export const RunPlaygroundInputSchema = z.object({
  workspaceSlug: z.string().min(1),
  promptId: z.string().min(1),
  versionId: z.string().min(1),
  variables: z.record(z.string(), z.string()).default({}),
  config: PromptConfigSchema.optional(),
});
export type RunPlaygroundInput = z.infer<typeof RunPlaygroundInputSchema>;

/**
 * Playground response
 */
export const PlaygroundResponseSchema = z.object({
  output: z.string(),
  model: z.string(),
  latencyMs: z.number(),
  promptTokens: z.number(),
  completionTokens: z.number(),
  totalTokens: z.number(),
  cost: z.number(),
});
export type PlaygroundResponse = z.infer<typeof PlaygroundResponseSchema>;

// ============================================================
// Analytics Schemas
// ============================================================

/**
 * Prompt analytics input
 */
export const PromptAnalyticsInputSchema = z.object({
  workspaceSlug: z.string().min(1),
  promptId: z.string().min(1),
  versionId: z.string().optional(),
  dateRange: z.object({
    start: z.date(),
    end: z.date(),
  }),
});
export type PromptAnalyticsInput = z.infer<typeof PromptAnalyticsInputSchema>;

/**
 * Version metrics
 */
export const VersionMetricsSchema = z.object({
  versionId: z.string(),
  version: z.number(),
  usageCount: z.number(),
  avgLatencyMs: z.number().nullable(),
  avgCost: z.number().nullable(),
  errorRate: z.number().nullable(),
});
export type VersionMetrics = z.infer<typeof VersionMetricsSchema>;

/**
 * Prompt analytics response
 */
export const PromptAnalyticsResponseSchema = z.object({
  totalUsage: z.number(),
  avgLatencyMs: z.number().nullable(),
  avgCost: z.number().nullable(),
  errorRate: z.number().nullable(),
  byVersion: z.array(VersionMetricsSchema),
});
export type PromptAnalyticsResponse = z.infer<typeof PromptAnalyticsResponseSchema>;

// ============================================================
// Utility Types
// ============================================================

/**
 * Compiled prompt - result of template compilation
 */
export const CompiledTextPromptSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});

export const CompiledChatPromptSchema = z.object({
  type: z.literal("chat"),
  messages: z.array(ChatMessageSchema),
});

export const CompiledPromptSchema = z.discriminatedUnion("type", [
  CompiledTextPromptSchema,
  CompiledChatPromptSchema,
]);
export type CompiledPrompt = z.infer<typeof CompiledPromptSchema>;

// ============================================================
// Constants
// ============================================================

/**
 * Default label for SDK fetch (when no label specified)
 */
export const DEFAULT_FETCH_LABEL: PromptLabelName = "latest";

/**
 * Variable placeholder regex
 */
export const VARIABLE_PLACEHOLDER_REGEX = /\{\{(\w+)\}\}/g;

/**
 * Max prompt name length
 */
export const MAX_PROMPT_NAME_LENGTH = 100;

/**
 * Max prompt slug length
 */
export const MAX_PROMPT_SLUG_LENGTH = 50;

/**
 * Max prompt description length
 */
export const MAX_PROMPT_DESCRIPTION_LENGTH = 500;
