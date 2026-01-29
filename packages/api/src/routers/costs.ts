/**
 * Cost Analytics Router
 *
 * Provides endpoints for cost tracking and analytics.
 * Supports filtering by trace/span properties.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { prisma, Prisma } from "@ducsigr/db";
import { createRouter, protectedProcedure, workspaceMiddleware } from "../trpc";
import {
  TimeRangeSchema,
  type TimeRange,
  type CostOverview,
  type ModelCostBreakdown,
  type CostTimePoint,
} from "../schemas/cost";
import { SpanTypeSchema, SpanLevelSchema } from "../schemas/traces";

/**
 * Input schema for cost queries with filters
 */
const CostQueryInput = z.object({
  workspaceSlug: z.string(),
  projectId: z.string(),
  timeRange: TimeRangeSchema.default("7d"),
  // Custom date range (when timeRange is "custom")
  customFrom: z.string().optional(),
  customTo: z.string().optional(),
  // Trace filters
  search: z.string().optional(),
  types: z.array(SpanTypeSchema).optional(),
  levels: z.array(SpanLevelSchema).optional(),
  models: z.array(z.string()).optional(),
  minDuration: z.number().min(0).optional(),
  maxDuration: z.number().min(0).optional(),
});

/**
 * Get date ranges for current and previous period
 */
const getDateRanges = (
  range: TimeRange,
  customFrom?: string,
  customTo?: string
) => {
  const now = new Date();
  const current = { start: new Date(), end: now };
  const previous = { start: new Date(), end: new Date() };

  // Handle custom date range
  if (range === "custom" && customFrom && customTo) {
    current.start = new Date(customFrom);
    current.end = new Date(customTo);
    // Calculate equivalent previous period
    const duration = current.end.getTime() - current.start.getTime();
    previous.end = new Date(current.start.getTime());
    previous.start = new Date(previous.end.getTime() - duration);
    return { current, previous };
  }

  switch (range) {
    case "24h":
      current.start.setHours(current.start.getHours() - 24);
      previous.end.setHours(previous.end.getHours() - 24);
      previous.start.setHours(previous.start.getHours() - 48);
      break;
    case "7d":
      current.start.setDate(current.start.getDate() - 7);
      previous.end.setDate(previous.end.getDate() - 7);
      previous.start.setDate(previous.start.getDate() - 14);
      break;
    case "30d":
      current.start.setDate(current.start.getDate() - 30);
      previous.end.setDate(previous.end.getDate() - 30);
      previous.start.setDate(previous.start.getDate() - 60);
      break;
  }

  return { current, previous };
};

/**
 * Calculate percentage change
 */
const calcChange = (current: number, previous: number): number => {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
};

/**
 * Build span filter conditions based on input
 */
type SpanFilters = z.infer<typeof CostQueryInput>;
const buildSpanFilters = (
  input: SpanFilters,
  dateRange: { start: Date; end: Date }
): Prisma.SpanWhereInput => {
  const conditions: Prisma.SpanWhereInput = {
    trace: {
      projectId: input.projectId,
      startTime: { gte: dateRange.start, lte: dateRange.end },
    },
    // Only include spans with costs
    totalCost: { not: null },
  };

  // Search filter - match span name (trace no longer has name field in OTLP-first design)
  if (input.search) {
    conditions.name = { contains: input.search, mode: "insensitive" };
  }

  // Status filter (was level, now statusCode in OTLP-first design)
  if (input.levels?.length) {
    conditions.statusCode = { in: input.levels };
  }

  // Model filter
  if (input.models?.length) {
    conditions.model = { in: input.models };
  }

  // Duration filter (span duration in ms)
  if (input.minDuration !== undefined || input.maxDuration !== undefined) {
    // We need to filter based on duration, but span stores startTime/endTime
    // This requires a raw query or computed field, skip for now
    // TODO: Add duration filtering support
  }

  return conditions;
};

/**
 * Costs Router
 */
export const costsRouter = createRouter({
  /**
   * Get cost overview for a project
   */
  getOverview: protectedProcedure
    .input(CostQueryInput)
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }): Promise<CostOverview> => {
      // Verify project access
      const project = await prisma.project.findFirst({
        where: { id: input.projectId, workspaceId: ctx.workspace.id },
        select: { id: true },
      });

      if (!project) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      }

      const { current, previous } = getDateRanges(input.timeRange, input.customFrom, input.customTo);

      // Always query directly from spans (CostDailySummary requires aggregation worker)
      const spanFilters = buildSpanFilters(input, current);
      const previousFilters = buildSpanFilters(input, previous);

      // Aggregate from spans
      const currentSpans = await prisma.span.aggregate({
        where: spanFilters,
        _sum: {
          totalCost: true,
          inputCost: true,
          outputCost: true,
          promptTokens: true,
          completionTokens: true,
          totalTokens: true,
        },
        _count: true,
      });

      const previousSpans = await prisma.span.aggregate({
        where: previousFilters,
        _sum: {
          totalCost: true,
          totalTokens: true,
        },
      });

      // Get unique trace count for spans with costs
      const traceIds = await prisma.span.findMany({
        where: spanFilters,
        select: { traceId: true },
        distinct: ["traceId"],
      });

      const totalCost = currentSpans._sum.totalCost?.toNumber() ?? 0;
      const previousCost = previousSpans._sum.totalCost?.toNumber() ?? 0;
      const totalTokens = Number(currentSpans._sum.totalTokens ?? 0);
      const inputTokens = Number(currentSpans._sum.promptTokens ?? 0);
      const outputTokens = Number(currentSpans._sum.completionTokens ?? 0);
      const previousTokens = Number(previousSpans._sum.totalTokens ?? 0);
      const traceCount = traceIds.length;

      return {
        totalCost,
        costChange: calcChange(totalCost, previousCost),
        totalTokens,
        inputTokens,
        outputTokens,
        tokenChange: calcChange(totalTokens, previousTokens),
        avgCostPerTrace: traceCount > 0 ? totalCost / traceCount : 0,
        billableSpans: currentSpans._count,
        breakdown: {
          inputCost: currentSpans._sum.inputCost?.toNumber() ?? 0,
          outputCost: currentSpans._sum.outputCost?.toNumber() ?? 0,
        },
      };
    }),

  /**
   * Get cost breakdown by model
   */
  getByModel: protectedProcedure
    .input(CostQueryInput)
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }): Promise<ModelCostBreakdown[]> => {
      const project = await prisma.project.findFirst({
        where: { id: input.projectId, workspaceId: ctx.workspace.id },
        select: { id: true },
      });

      if (!project) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      }

      const { current } = getDateRanges(input.timeRange, input.customFrom, input.customTo);

      // Always query directly from spans
      const spanFilters = buildSpanFilters(input, current);

      // Group by model from spans
      const modelData = await prisma.span.groupBy({
        by: ["model"],
        where: {
          ...spanFilters,
          model: { not: null },
        },
        _sum: {
          totalCost: true,
          totalTokens: true,
        },
        _count: true,
        orderBy: {
          _sum: { totalCost: "desc" },
        },
      });

      const totalCost = modelData.reduce(
        (sum, m) => sum + (m._sum.totalCost?.toNumber() ?? 0),
        0
      );

      const pricing = await prisma.modelPricing.findMany({
        where: {
          model: { in: modelData.map((m) => m.model!).filter(Boolean) },
          effectiveTo: null,
        },
        select: { model: true, displayName: true, provider: true },
      });

      const pricingMap = new Map(pricing.map((p) => [p.model, p]));

      return modelData
        .filter((m) => m.model)
        .map((m) => {
          const cost = m._sum.totalCost?.toNumber() ?? 0;
          const tokens = Number(m._sum.totalTokens ?? 0);
          const pricingInfo = pricingMap.get(m.model!);

          return {
            model: m.model!,
            displayName: pricingInfo?.displayName ?? m.model!,
            provider: pricingInfo?.provider ?? "unknown",
            cost,
            percentage: totalCost > 0 ? (cost / totalCost) * 100 : 0,
            tokens,
            spanCount: m._count,
          };
        });
    }),

  /**
   * Get cost time series
   */
  getTimeSeries: protectedProcedure
    .input(CostQueryInput)
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }): Promise<CostTimePoint[]> => {
      const project = await prisma.project.findFirst({
        where: { id: input.projectId, workspaceId: ctx.workspace.id },
        select: { id: true },
      });

      if (!project) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      }

      const { current } = getDateRanges(input.timeRange, input.customFrom, input.customTo);

      // Always query directly from spans
      const spanFilters = buildSpanFilters(input, current);

      // Get spans with their costs and group by date
      const spans = await prisma.span.findMany({
        where: spanFilters,
        select: {
          startTime: true,
          totalCost: true,
          inputCost: true,
          outputCost: true,
          totalTokens: true,
        },
      });

      // Group by date
      const dateMap = new Map<string, CostTimePoint>();
      for (const span of spans) {
        const dateKey = span.startTime.toISOString().slice(0, 10);
        const existing = dateMap.get(dateKey) ?? {
          date: dateKey,
          cost: 0,
          inputCost: 0,
          outputCost: 0,
          tokens: 0,
        };
        existing.cost += span.totalCost?.toNumber() ?? 0;
        existing.inputCost += span.inputCost?.toNumber() ?? 0;
        existing.outputCost += span.outputCost?.toNumber() ?? 0;
        existing.tokens += Number(span.totalTokens ?? 0);
        dateMap.set(dateKey, existing);
      }

      return Array.from(dateMap.values()).sort((a, b) =>
        a.date.localeCompare(b.date)
      );
    }),

  /**
   * List all current model pricing
   */
  listPricing: protectedProcedure.query(async () => {
    const pricing = await prisma.modelPricing.findMany({
      where: {
        effectiveFrom: { lte: new Date() },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
      },
      orderBy: [{ provider: "asc" }, { model: "asc" }],
    });

    return pricing.map((p) => ({
      id: p.id,
      provider: p.provider,
      model: p.model,
      displayName: p.displayName,
      inputPricePerMillion: p.inputPricePerMillion.toNumber(),
      outputPricePerMillion: p.outputPricePerMillion.toNumber(),
    }));
  }),
});

export type CostsRouter = typeof costsRouter;
