/**
 * Prompts Route
 *
 * Public REST API for SDK prompt retrieval.
 * Provides runtime access to prompts using API key authentication.
 *
 * Features:
 * - API key authentication (same as traces)
 * - ETag support for cache validation
 * - Resolution precedence: version > label > production > latest
 * - Rate limiting
 *
 * @endpoint GET /v1/prompts/:slug
 */
import { Router, type Router as RouterType, type Request, type Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { logger } from "../lib/logger.js";
import { rateLimitMiddleware } from "../middleware/rate-limit.js";
import { hashApiKey } from "@ducsigr/shared";
import {
  type PromptLabelName,
  PromptLabelNameSchema,
  PromptTypeSchema,
  DEFAULT_FETCH_LABEL,
} from "@ducsigr/api/schemas";

export const promptsRouter: RouterType = Router();

// Apply rate limiting
promptsRouter.use(rateLimitMiddleware);

/**
 * Query parameter schema
 */
const QuerySchema = z.object({
  label: PromptLabelNameSchema.optional(),
  version: z.coerce.number().int().positive().optional(),
  type: PromptTypeSchema.optional(),
});

/**
 * Extract and validate API key from request
 */
const extractApiKey = (req: Request): string | null => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  const xApiKey = req.headers["x-api-key"];
  if (typeof xApiKey === "string") {
    return xApiKey;
  }

  return null;
};

/**
 * Validate API key and get project ID
 */
const authenticateRequest = async (
  req: Request,
  res: Response
): Promise<{ projectId: string } | null> => {
  const apiKey = extractApiKey(req);

  if (!apiKey) {
    res.status(401).json({
      error: "UNAUTHORIZED",
      message: "API key is required. Provide via Authorization header (Bearer token) or X-API-Key header.",
    });
    return null;
  }

  const keyPrefix = apiKey.substring(0, 12);

  try {
    const hashedKey = hashApiKey(apiKey);

    const keyRecord = await prisma.apiKey.findUnique({
      where: { hashedKey },
      select: {
        id: true,
        projectId: true,
        expiresAt: true,
      },
    });

    if (!keyRecord) {
      logger.warn({ keyPrefix }, "API key not found for prompt fetch");
      res.status(401).json({
        error: "UNAUTHORIZED",
        message: "Invalid API key",
      });
      return null;
    }

    if (keyRecord.expiresAt && keyRecord.expiresAt < new Date()) {
      logger.warn({ keyPrefix }, "Expired API key used for prompt fetch");
      res.status(401).json({
        error: "UNAUTHORIZED",
        message: "API key has expired",
      });
      return null;
    }

    // Update lastUsedAt (non-blocking)
    prisma.apiKey
      .update({
        where: { id: keyRecord.id },
        data: { lastUsedAt: new Date() },
      })
      .catch((err) => {
        logger.warn({ error: err }, "Failed to update lastUsedAt");
      });

    return { projectId: keyRecord.projectId };
  } catch (error) {
    logger.error({ error, keyPrefix }, "Database error during prompt auth");
    res.status(500).json({
      error: "INTERNAL_ERROR",
      message: "Authentication service error",
    });
    return null;
  }
};

/**
 * Resolve prompt version based on options
 *
 * Resolution precedence:
 * 1. Specific version number (if provided)
 * 2. Label (if provided)
 * 3. "production" label (if exists)
 * 4. "latest" label (fallback)
 */
const resolvePromptVersion = async (
  projectId: string,
  slug: string,
  options: { label?: PromptLabelName; version?: number; type?: "text" | "chat" }
) => {
  // First, find the prompt
  const prompt = await prisma.prompt.findUnique({
    where: {
      projectId_slug: { projectId, slug },
    },
    select: {
      id: true,
      name: true,
      slug: true,
      isArchived: true,
    },
  });

  if (!prompt || prompt.isArchived) {
    return null;
  }

  // If specific version requested
  if (options.version !== undefined) {
    const version = await prisma.promptVersion.findUnique({
      where: {
        promptId_version: {
          promptId: prompt.id,
          version: options.version,
        },
      },
      select: {
        id: true,
        version: true,
        type: true,
        content: true,
        variables: true,
        config: true,
        checksum: true,
        labels: {
          select: { name: true },
        },
      },
    });

    if (!version) {
      return null;
    }

    // Check type filter
    if (options.type && version.type !== options.type) {
      return null;
    }

    return {
      id: version.id,
      promptId: prompt.id,
      name: prompt.name,
      slug: prompt.slug,
      version: version.version,
      type: version.type,
      content: version.content,
      variables: version.variables,
      config: version.config,
      checksum: version.checksum,
      label: version.labels[0]?.name ?? null,
    };
  }

  // Determine which label to use
  const targetLabel = options.label ?? DEFAULT_FETCH_LABEL;

  // Try to find version by label
  const labelRecord = await prisma.promptLabel.findUnique({
    where: {
      promptId_name: {
        promptId: prompt.id,
        name: targetLabel,
      },
    },
    select: {
      version: {
        select: {
          id: true,
          version: true,
          type: true,
          content: true,
          variables: true,
          config: true,
          checksum: true,
        },
      },
    },
  });

  if (labelRecord?.version) {
    const version = labelRecord.version;

    // Check type filter
    if (options.type && version.type !== options.type) {
      return null;
    }

    return {
      id: version.id,
      promptId: prompt.id,
      name: prompt.name,
      slug: prompt.slug,
      version: version.version,
      type: version.type,
      content: version.content,
      variables: version.variables,
      config: version.config,
      checksum: version.checksum,
      label: targetLabel,
    };
  }

  // Fallback: if no label found and not explicitly requested, try production then latest
  if (!options.label) {
    // Try production
    const productionLabel = await prisma.promptLabel.findUnique({
      where: {
        promptId_name: {
          promptId: prompt.id,
          name: "production",
        },
      },
      select: {
        version: {
          select: {
            id: true,
            version: true,
            type: true,
            content: true,
            variables: true,
            config: true,
            checksum: true,
          },
        },
      },
    });

    if (productionLabel?.version) {
      const version = productionLabel.version;

      if (!options.type || version.type === options.type) {
        return {
          id: version.id,
          promptId: prompt.id,
          name: prompt.name,
          slug: prompt.slug,
          version: version.version,
          type: version.type,
          content: version.content,
          variables: version.variables,
          config: version.config,
          checksum: version.checksum,
          label: "production",
        };
      }
    }
  }

  // Final fallback: get the latest version by version number
  const latestVersion = await prisma.promptVersion.findFirst({
    where: {
      promptId: prompt.id,
      ...(options.type && { type: options.type }),
    },
    orderBy: { version: "desc" },
    select: {
      id: true,
      version: true,
      type: true,
      content: true,
      variables: true,
      config: true,
      checksum: true,
      labels: {
        select: { name: true },
      },
    },
  });

  if (!latestVersion) {
    return null;
  }

  return {
    id: latestVersion.id,
    promptId: prompt.id,
    name: prompt.name,
    slug: prompt.slug,
    version: latestVersion.version,
    type: latestVersion.type,
    content: latestVersion.content,
    variables: latestVersion.variables,
    config: latestVersion.config,
    checksum: latestVersion.checksum,
    label: latestVersion.labels[0]?.name ?? null,
  };
};

/**
 * GET /v1/prompts/:slug
 *
 * Fetch a prompt by slug with optional version/label targeting.
 *
 * Query params:
 * - label: "production" | "staging" | "latest"
 * - version: Specific version number
 * - type: "text" | "chat" (filter by type)
 *
 * Headers:
 * - Authorization: Bearer <api-key>
 * - X-API-Key: <api-key>
 * - If-None-Match: ETag for cache validation
 *
 * Response:
 * - 200: Prompt data
 * - 304: Not Modified (if ETag matches)
 * - 401: Unauthorized
 * - 404: Prompt not found
 * - 429: Rate limited
 */
promptsRouter.get("/:slug", async (req: Request, res: Response) => {
  // Authenticate
  const auth = await authenticateRequest(req, res);
  if (!auth) return;

  const { projectId } = auth;
  const slug = req.params.slug;

  if (!slug) {
    res.status(400).json({
      error: "INVALID_REQUEST",
      message: "Prompt slug is required",
    });
    return;
  }

  // Validate query params
  const queryParsed = QuerySchema.safeParse(req.query);
  if (!queryParsed.success) {
    res.status(400).json({
      error: "INVALID_QUERY",
      message: "Invalid query parameters",
      details: queryParsed.error.flatten(),
    });
    return;
  }

  const { label, version, type } = queryParsed.data;

  try {
    // Resolve prompt version
    const prompt = await resolvePromptVersion(projectId, slug, {
      label,
      version,
      type,
    });

    if (!prompt) {
      res.status(404).json({
        error: "PROMPT_NOT_FOUND",
        message: `Prompt "${slug}" not found or does not match criteria`,
      });
      return;
    }

    // ETag support for caching
    const etag = `"${prompt.checksum}"`;
    const ifNoneMatch = req.headers["if-none-match"];

    if (ifNoneMatch === etag) {
      res.status(304).end();
      return;
    }

    // Set cache headers
    res.setHeader("ETag", etag);
    res.setHeader("Cache-Control", "private, max-age=60");

    // Return prompt data
    res.json({
      id: prompt.id,
      promptId: prompt.promptId,
      name: prompt.name,
      slug: prompt.slug,
      version: prompt.version,
      type: prompt.type,
      content: prompt.content,
      variables: prompt.variables,
      config: prompt.config,
      checksum: prompt.checksum,
      label: prompt.label,
    });
  } catch (error) {
    logger.error({ error, slug, projectId }, "Error fetching prompt");
    res.status(500).json({
      error: "INTERNAL_ERROR",
      message: "Failed to fetch prompt",
    });
  }
});

/**
 * POST /v1/prompts/compile (optional - server-side compilation)
 *
 * Compile a prompt with variables on the server side.
 * Useful for clients that don't want to do local compilation.
 *
 * Body:
 * - slug: Prompt slug
 * - label?: Label to use
 * - version?: Specific version
 * - variables: Record<string, string> - Variable values
 */
promptsRouter.post("/compile", async (req: Request, res: Response) => {
  // Authenticate
  const auth = await authenticateRequest(req, res);
  if (!auth) return;

  const { projectId } = auth;

  // Validate body
  const bodySchema = z.object({
    slug: z.string().min(1),
    label: PromptLabelNameSchema.optional(),
    version: z.number().int().positive().optional(),
    variables: z.record(z.string(), z.string()).default({}),
  });

  const bodyParsed = bodySchema.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({
      error: "INVALID_BODY",
      message: "Invalid request body",
      details: bodyParsed.error.flatten(),
    });
    return;
  }

  const { slug, label, version, variables } = bodyParsed.data;

  try {
    // Resolve prompt version
    const prompt = await resolvePromptVersion(projectId, slug, {
      label,
      version,
    });

    if (!prompt) {
      res.status(404).json({
        error: "PROMPT_NOT_FOUND",
        message: `Prompt "${slug}" not found`,
      });
      return;
    }

    // Validate and compile template
    const contentParsed = PromptContentSchema.safeParse(prompt.content);
    if (!contentParsed.success) {
      res.status(500).json({
        error: "INVALID_PROMPT_CONTENT",
        message: "Prompt content has invalid structure",
      });
      return;
    }

    const compiled = compileTemplate(contentParsed.data, variables);

    // Return compiled prompt
    res.json({
      id: prompt.id,
      promptId: prompt.promptId,
      name: prompt.name,
      slug: prompt.slug,
      version: prompt.version,
      type: prompt.type,
      compiled,
      config: prompt.config,
      checksum: prompt.checksum,
      label: prompt.label,
    });
  } catch (error) {
    logger.error({ error, slug, projectId }, "Error compiling prompt");
    res.status(500).json({
      error: "INTERNAL_ERROR",
      message: "Failed to compile prompt",
    });
  }
});

/**
 * Template content schemas (using Zod for runtime validation)
 */
const ChatMessageSchema = z.object({
  role: z.string(),
  content: z.string(),
  name: z.string().optional(),
});

const TextContentSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});

const ChatContentSchema = z.object({
  type: z.literal("chat"),
  messages: z.array(ChatMessageSchema),
});

const PromptContentSchema = z.discriminatedUnion("type", [
  TextContentSchema,
  ChatContentSchema,
]);

type PromptContent = z.infer<typeof PromptContentSchema>;

/**
 * Compile template by replacing {{variable}} placeholders
 */
const compileTemplate = (
  content: PromptContent,
  variables: Record<string, string>
): PromptContent => {
  const replacePlaceholders = (text: string): string => {
    return text.replace(/\{\{(\w+)\}\}/g, (match: string, varName: string): string => {
      const value = variables[varName];
      if (value !== undefined) {
        return value;
      }
      return match; // Leave unmatched placeholders
    });
  };

  if (content.type === "text") {
    return {
      type: "text",
      text: replacePlaceholders(content.text),
    };
  }

  return {
    type: "chat",
    messages: content.messages.map((m) => ({
      ...m,
      content: replacePlaceholders(m.content),
    })),
  };
};
