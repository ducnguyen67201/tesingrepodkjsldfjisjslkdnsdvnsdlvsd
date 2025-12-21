/**
 * Filters Router
 *
 * Provides autocomplete and facet endpoints for Trace Filtering v2.
 * Used by the filter UI to populate suggestions and statistics.
 *
 * @see docs/specs/tracing/TRACING_FILTERING_SEARCH_V2_SPEC.md
 */

import { TRPCError } from "@trpc/server";
import { prisma } from "@cognobserve/db";
import { createRouter, protectedProcedure, workspaceMiddleware } from "../trpc";
import {
  FilterKeysInputSchema,
  FilterValuesInputSchema,
  FilterStatsInputSchema,
} from "../schemas/filtering";
import { getQueryBuilder } from "../lib/filtering";

// ============================================================================
// Router
// ============================================================================

export const filtersRouter = createRouter({
  /**
   * Get attribute keys for autocomplete.
   * Returns common attribute keys based on scope (resource or span).
   */
  keys: protectedProcedure
    .input(FilterKeysInputSchema)
    .query(async ({ ctx, input }) => {
      const { projectId, scope, prefix, limit } = input;

      // Verify project access
      const project = await prisma.project.findFirst({
        where: {
          id: projectId,
          workspace: {
            members: {
              some: { userId: ctx.session.user.id },
            },
          },
        },
        select: { id: true },
      });

      if (!project) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project not found",
        });
      }

      const builder = getQueryBuilder();
      const keys = await builder.getAttributeKeys(projectId, scope, prefix, limit);

      return { keys };
    }),

  /**
   * Get attribute values for autocomplete.
   * Returns distinct values for a given attribute key.
   */
  values: protectedProcedure
    .input(FilterValuesInputSchema)
    .query(async ({ ctx, input }) => {
      const { projectId, scope, key, prefix, limit } = input;

      // Verify project access
      const project = await prisma.project.findFirst({
        where: {
          id: projectId,
          workspace: {
            members: {
              some: { userId: ctx.session.user.id },
            },
          },
        },
        select: { id: true },
      });

      if (!project) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project not found",
        });
      }

      const builder = getQueryBuilder();
      const values = await builder.getAttributeValues(
        projectId,
        scope,
        key,
        prefix,
        limit
      );

      return { values };
    }),

  /**
   * Get filter statistics (facets) for the filter UI.
   * Returns counts for services, environments, status codes, etc.
   */
  stats: protectedProcedure
    .input(FilterStatsInputSchema)
    .query(async ({ ctx, input }) => {
      const { projectId, timeRange, filter } = input;

      // Verify project access
      const project = await prisma.project.findFirst({
        where: {
          id: projectId,
          workspace: {
            members: {
              some: { userId: ctx.session.user.id },
            },
          },
        },
        select: { id: true },
      });

      if (!project) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project not found",
        });
      }

      const builder = getQueryBuilder();
      const stats = await builder.getFilterStats(projectId, timeRange, filter);

      return stats;
    }),
});
