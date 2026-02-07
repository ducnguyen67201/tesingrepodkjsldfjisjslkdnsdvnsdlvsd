/**
 * Prompt Experiments Route
 *
 * Public REST API for A/B experiment resolution.
 * Provides runtime assignment of users to experiment variants.
 *
 * Features:
 * - Deterministic bucketing based on assignment key + seed
 * - Sticky assignment (same key always gets same variant)
 * - Allocation percentage support
 * - Force variant for testing
 * - Returns prompt payload with trace metadata
 *
 * @endpoint GET /v1/prompt-experiments/:slug/resolve
 */
import { Router, type Router as RouterType, type Request, type Response } from "express";
import { z } from "zod";
import crypto from "crypto";
import { prisma } from "../lib/db.js";
import { logger } from "../lib/logger.js";
import { rateLimitMiddleware } from "../middleware/rate-limit.js";
import { hashApiKey } from "@ducsigr/shared";
import { VariantNameSchema } from "@ducsigr/api/schemas";

export const promptExperimentsRouter: RouterType = Router();

// Apply rate limiting
promptExperimentsRouter.use(rateLimitMiddleware);

// ============================================================
// Constants
// ============================================================

/** Total basis points for bucketing (0-9999 = 10000 buckets) */
const TOTAL_BASIS_POINTS = 10000;

/** Multiplier to convert allocation percentage to basis points */
const ALLOCATION_TO_BASIS_POINTS = 100;

// ============================================================
// Types & Schemas
// ============================================================

/**
 * Query parameter schema for resolve endpoint
 */
const ResolveQuerySchema = z.object({
  assignmentKey: z.string().min(1, "Assignment key is required"),
  forceVariant: VariantNameSchema.optional(),
});

// ============================================================
// Helper Functions
// ============================================================

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
      message:
        "API key is required. Provide via Authorization header (Bearer token) or X-API-Key header.",
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
      logger.warn({ keyPrefix }, "API key not found for experiment resolve");
      res.status(401).json({
        error: "UNAUTHORIZED",
        message: "Invalid API key",
      });
      return null;
    }

    if (keyRecord.expiresAt && keyRecord.expiresAt < new Date()) {
      logger.warn({ keyPrefix }, "Expired API key used for experiment resolve");
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
    logger.error({ error, keyPrefix }, "Database error during experiment auth");
    res.status(500).json({
      error: "INTERNAL_ERROR",
      message: "Authentication service error",
    });
    return null;
  }
};

/**
 * Hash assignment key for trace storage (privacy)
 */
const hashAssignmentKey = (key: string): string => {
  return crypto.createHash("sha256").update(key).digest("hex");
};

/**
 * Compute bucket for deterministic assignment
 *
 * Algorithm:
 * 1. Hash(assignmentKey + assignmentSeed) → 32 bytes
 * 2. Take first 4 bytes as unsigned int
 * 3. Mod by TOTAL_BASIS_POINTS to get bucket (0-9999)
 */
const computeBucket = (assignmentKey: string, seed: string): number => {
  const hash = crypto.createHash("sha256").update(`${assignmentKey}:${seed}`).digest();
  // Read first 4 bytes as unsigned big-endian integer
  const value = hash.readUInt32BE(0);
  return value % TOTAL_BASIS_POINTS;
};

/**
 * Select variant based on bucket and weights
 *
 * Variants have weights in basis points (0-10000).
 * We iterate through variants in order, accumulating weights,
 * and return the first variant where bucket < cumulative.
 */
const selectVariant = (
  bucket: number,
  variants: Array<{ id: string; name: string; weight: number; isControl: boolean }>
): { id: string; name: string; isControl: boolean } | null => {
  let cumulative = 0;
  for (const variant of variants) {
    cumulative += variant.weight;
    if (bucket < cumulative) {
      return { id: variant.id, name: variant.name, isControl: variant.isControl };
    }
  }
  // Should not reach here if weights sum to 10000
  return variants[0]
    ? { id: variants[0].id, name: variants[0].name, isControl: variants[0].isControl }
    : null;
};

// ============================================================
// Routes
// ============================================================

/**
 * GET /v1/prompt-experiments/:slug/resolve
 *
 * Resolve experiment assignment for a user.
 *
 * Query params:
 * - assignmentKey: Required. User/session identifier for bucketing
 * - forceVariant: Optional. "A" or "B" to force a specific variant (for testing)
 *
 * Headers:
 * - Authorization: Bearer <api-key>
 * - X-API-Key: <api-key>
 *
 * Response:
 * - 200: Assignment with prompt payload and trace metadata
 * - 401: Unauthorized
 * - 404: Experiment not found or not running
 * - 400: Invalid parameters
 * - 429: Rate limited
 */
promptExperimentsRouter.get("/:slug/resolve", async (req: Request, res: Response) => {
  // Authenticate
  const auth = await authenticateRequest(req, res);
  if (!auth) return;

  const { projectId } = auth;
  const slug = req.params.slug;

  if (!slug) {
    res.status(400).json({
      error: "INVALID_REQUEST",
      message: "Experiment slug is required",
    });
    return;
  }

  // Validate query params
  const queryParsed = ResolveQuerySchema.safeParse(req.query);
  if (!queryParsed.success) {
    res.status(400).json({
      error: "INVALID_QUERY",
      message: "Invalid query parameters",
      details: queryParsed.error.flatten(),
    });
    return;
  }

  const { assignmentKey, forceVariant } = queryParsed.data;

  try {
    // Fetch experiment with variants
    const experiment = await prisma.promptExperiment.findUnique({
      where: {
        projectId_slug: { projectId, slug },
      },
      include: {
        variants: {
          include: {
            promptVersion: {
              include: {
                prompt: {
                  select: { name: true, slug: true },
                },
              },
            },
          },
          orderBy: { name: "asc" }, // A before B
        },
      },
    });

    if (!experiment) {
      res.status(404).json({
        error: "EXPERIMENT_NOT_FOUND",
        message: `Experiment "${slug}" not found`,
      });
      return;
    }

    // Only running experiments can be resolved
    if (experiment.status !== "running") {
      res.status(404).json({
        error: "EXPERIMENT_NOT_RUNNING",
        message: `Experiment "${slug}" is not running (status: ${experiment.status})`,
      });
      return;
    }

    if (experiment.variants.length === 0) {
      res.status(500).json({
        error: "EXPERIMENT_INVALID",
        message: "Experiment has no variants configured",
      });
      return;
    }

    // Hash assignment key for storage (never store raw)
    const assignmentKeyHash = hashAssignmentKey(assignmentKey);

    // Compute bucket for this user (0 to TOTAL_BASIS_POINTS - 1)
    const bucket = computeBucket(assignmentKey, experiment.assignmentSeed);

    // Check if user is in allocation
    // allocationPct is 0-100, convert to basis points (0-10000)
    const allocationThreshold = experiment.allocationPct * ALLOCATION_TO_BASIS_POINTS;
    const inAllocation = bucket < allocationThreshold;

    let selectedVariant: { id: string; name: string; isControl: boolean } | null = null;
    let selectedVersion: (typeof experiment.variants)[0]["promptVersion"] | null = null;

    if (forceVariant) {
      // Force specific variant (for testing)
      const forced = experiment.variants.find((v) => v.name === forceVariant);
      if (forced) {
        selectedVariant = { id: forced.id, name: forced.name, isControl: forced.isControl };
        selectedVersion = forced.promptVersion;
      }
    } else if (inAllocation) {
      // User is in experiment allocation - select variant by weight
      // Use original bucket directly for stable assignment regardless of allocation changes
      // Variant weights are already normalized to TOTAL_BASIS_POINTS (10000)
      selectedVariant = selectVariant(
        bucket,
        experiment.variants.map((v) => ({
          id: v.id,
          name: v.name,
          weight: v.weight,
          isControl: v.isControl,
        }))
      );

      if (selectedVariant) {
        const variant = experiment.variants.find((v) => v.id === selectedVariant!.id);
        selectedVersion = variant?.promptVersion ?? null;
      }
    } else {
      // User is outside allocation - use control variant as fallback
      const control = experiment.variants.find((v) => v.isControl);
      if (control) {
        selectedVariant = { id: control.id, name: control.name, isControl: control.isControl };
        selectedVersion = control.promptVersion;
      } else {
        // Fallback to first variant if no control defined
        const first = experiment.variants[0];
        if (first) {
          selectedVariant = { id: first.id, name: first.name, isControl: first.isControl };
          selectedVersion = first.promptVersion;
        }
      }
    }

    if (!selectedVariant || !selectedVersion) {
      res.status(500).json({
        error: "ASSIGNMENT_FAILED",
        message: "Failed to assign variant",
      });
      return;
    }

    // Log assignment (no raw keys)
    logger.info(
      {
        experimentId: experiment.id,
        experimentSlug: slug,
        variantId: selectedVariant.id,
        variantName: selectedVariant.name,
        inAllocation,
        forced: !!forceVariant,
      },
      "Experiment assignment resolved"
    );

    // Build response
    res.json({
      experiment: {
        id: experiment.id,
        slug: experiment.slug,
        name: experiment.name,
        status: experiment.status,
      },
      variant: {
        id: selectedVariant.id,
        name: selectedVariant.name,
        isControl: selectedVariant.isControl,
      },
      inAllocation,
      prompt: {
        id: selectedVersion.id,
        promptId: selectedVersion.promptId,
        name: selectedVersion.prompt.name,
        slug: selectedVersion.prompt.slug,
        version: selectedVersion.version,
        type: selectedVersion.type,
        content: selectedVersion.content,
        variables: selectedVersion.variables,
        config: selectedVersion.config,
        checksum: selectedVersion.checksum,
      },
      traceMetadata: {
        promptExperimentId: experiment.id,
        promptExperimentSlug: experiment.slug,
        promptVariantId: selectedVariant.id,
        promptVariantName: selectedVariant.name,
        assignmentKeyHash,
      },
    });
  } catch (error) {
    logger.error({ error, slug, projectId }, "Error resolving experiment");
    res.status(500).json({
      error: "INTERNAL_ERROR",
      message: "Failed to resolve experiment",
    });
  }
});

/**
 * GET /v1/prompt-experiments/:slug
 *
 * Get experiment metadata (without resolution).
 * Useful for checking experiment status.
 */
promptExperimentsRouter.get("/:slug", async (req: Request, res: Response) => {
  // Authenticate
  const auth = await authenticateRequest(req, res);
  if (!auth) return;

  const { projectId } = auth;
  const slug = req.params.slug;

  if (!slug) {
    res.status(400).json({
      error: "INVALID_REQUEST",
      message: "Experiment slug is required",
    });
    return;
  }

  try {
    const experiment = await prisma.promptExperiment.findUnique({
      where: {
        projectId_slug: { projectId, slug },
      },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        status: true,
        allocationPct: true,
        assignmentKey: true,
        startedAt: true,
        endedAt: true,
        tags: true,
        variants: {
          select: {
            id: true,
            name: true,
            weight: true,
            isControl: true,
            promptVersion: {
              select: {
                id: true,
                version: true,
                prompt: {
                  select: { name: true, slug: true },
                },
              },
            },
          },
          orderBy: { name: "asc" },
        },
      },
    });

    if (!experiment) {
      res.status(404).json({
        error: "EXPERIMENT_NOT_FOUND",
        message: `Experiment "${slug}" not found`,
      });
      return;
    }

    res.json({
      id: experiment.id,
      name: experiment.name,
      slug: experiment.slug,
      description: experiment.description,
      status: experiment.status,
      allocationPct: experiment.allocationPct,
      assignmentKey: experiment.assignmentKey,
      startedAt: experiment.startedAt,
      endedAt: experiment.endedAt,
      tags: experiment.tags,
      variants: experiment.variants.map((v) => ({
        id: v.id,
        name: v.name,
        weight: v.weight,
        isControl: v.isControl,
        promptVersionId: v.promptVersion.id,
        promptVersion: v.promptVersion.version,
        promptName: v.promptVersion.prompt.name,
        promptSlug: v.promptVersion.prompt.slug,
      })),
    });
  } catch (error) {
    logger.error({ error, slug, projectId }, "Error fetching experiment");
    res.status(500).json({
      error: "INTERNAL_ERROR",
      message: "Failed to fetch experiment",
    });
  }
});
