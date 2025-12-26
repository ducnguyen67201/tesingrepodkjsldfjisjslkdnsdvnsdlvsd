/**
 * Graph Query Service
 *
 * Executes graph queries against traces, spans, and logs.
 * Supports time series aggregations with bucketing.
 */

import { prisma } from "@cognobserve/db";
import { Prisma } from "@cognobserve/db";
import type {
  GraphQuery,
  GraphQueryResult,
  GraphSeries,
  Bucket,
  MetricOp,
} from "../schemas/dashboard";
import {
  timeRangeToDateRange,
  getAutoBucket,
  bucketToMs,
} from "../schemas/dashboard";

/**
 * GraphQueryService - Static class for executing graph queries
 */
export class GraphQueryService {
  /**
   * Execute a graph query and return time series data
   */
  static async execute(
    projectId: string,
    query: GraphQuery
  ): Promise<GraphQueryResult> {
    // Calculate time range
    const { from, to } = timeRangeToDateRange(query.timeRange, query.customTimeRange);

    // Determine bucket size
    const bucket =
      query.bucket === "auto"
        ? getAutoBucket(from.getTime(), to.getTime())
        : query.bucket;

    // Execute query based on source
    switch (query.source) {
      case "trace":
        return this.executeTraceQuery(projectId, query, from, to, bucket);
      case "span":
        return this.executeSpanQuery(projectId, query, from, to, bucket);
      case "log":
        return this.executeLogQuery(projectId, query, from, to, bucket);
      default:
        throw new Error(`Unknown source: ${query.source}`);
    }
  }

  /**
   * Execute query against traces
   */
  private static async executeTraceQuery(
    projectId: string,
    query: GraphQuery,
    from: Date,
    to: Date,
    bucket: Bucket
  ): Promise<GraphQueryResult> {
    const bucketInterval = this.getBucketInterval(bucket);

    // Build WHERE clause
    const whereClause = this.buildTraceWhereClause(projectId, query.filters, from, to);

    // Build the aggregation query
    const sql = Prisma.sql`
      SELECT
        DATE_TRUNC(${Prisma.raw(`'${bucketInterval}'`)}, "startTime") as bucket_time,
        ${this.buildAggregation(query.op, query.field || "id", "trace")}
        ${query.groupBy?.length ? Prisma.sql`, ${Prisma.raw(query.groupBy.map(g => `"${g}"`).join(", "))}` : Prisma.empty}
      FROM "Trace"
      ${whereClause}
      GROUP BY bucket_time ${query.groupBy?.length ? Prisma.sql`, ${Prisma.raw(query.groupBy.map(g => `"${g}"`).join(", "))}` : Prisma.empty}
      ORDER BY bucket_time ASC
      ${query.limit ? Prisma.sql`LIMIT ${query.limit}` : Prisma.empty}
    `;

    console.log("[GraphQueryService] Trace query:", {
      projectId,
      bucket,
      bucketInterval,
      from: from.toISOString(),
      to: to.toISOString(),
    });

    const rows = await prisma.$queryRaw<Array<{
      bucket_time: Date;
      value: bigint | number;
      [key: string]: unknown;
    }>>(sql);

    console.log("[GraphQueryService] Trace rows:", rows.length);

    // Convert to series format with filled time buckets
    const series = this.convertToSeries(rows, query.groupBy, from, to, bucket);

    return {
      series,
      total: series.reduce((acc, s) => acc + s.data.reduce((a, d) => a + d.value, 0), 0),
      metadata: {
        source: "trace",
        bucket,
        timeRange: {
          from: from.toISOString(),
          to: to.toISOString(),
        },
      },
    };
  }

  /**
   * Execute query against spans
   */
  private static async executeSpanQuery(
    projectId: string,
    query: GraphQuery,
    from: Date,
    to: Date,
    bucket: Bucket
  ): Promise<GraphQueryResult> {
    const bucketInterval = this.getBucketInterval(bucket);

    // Build WHERE clause
    const whereClause = this.buildSpanWhereClause(projectId, query.filters, from, to);

    // Build the aggregation query
    const sql = Prisma.sql`
      SELECT
        DATE_TRUNC(${Prisma.raw(`'${bucketInterval}'`)}, s."startTime") as bucket_time,
        ${this.buildAggregation(query.op, query.field || "id", "span")}
        ${query.groupBy?.length ? Prisma.sql`, ${Prisma.raw(query.groupBy.map(g => `s."${g}"`).join(", "))}` : Prisma.empty}
      FROM "Span" s
      INNER JOIN "Trace" t ON s."traceId" = t."id"
      ${whereClause}
      GROUP BY bucket_time ${query.groupBy?.length ? Prisma.sql`, ${Prisma.raw(query.groupBy.map(g => `s."${g}"`).join(", "))}` : Prisma.empty}
      ORDER BY bucket_time ASC
      ${query.limit ? Prisma.sql`LIMIT ${query.limit}` : Prisma.empty}
    `;

    const rows = await prisma.$queryRaw<Array<{
      bucket_time: Date;
      value: bigint | number;
      [key: string]: unknown;
    }>>(sql);

    // Convert to series format with filled time buckets
    const series = this.convertToSeries(rows, query.groupBy, from, to, bucket);

    return {
      series,
      total: series.reduce((acc, s) => acc + s.data.reduce((a, d) => a + d.value, 0), 0),
      metadata: {
        source: "span",
        bucket,
        timeRange: {
          from: from.toISOString(),
          to: to.toISOString(),
        },
      },
    };
  }

  /**
   * Execute query against logs
   */
  private static async executeLogQuery(
    projectId: string,
    query: GraphQuery,
    from: Date,
    to: Date,
    bucket: Bucket
  ): Promise<GraphQueryResult> {
    const bucketInterval = this.getBucketInterval(bucket);

    // Build WHERE clause
    const whereClause = this.buildLogWhereClause(projectId, query.filters, from, to);

    // Build the aggregation query
    const sql = Prisma.sql`
      SELECT
        DATE_TRUNC(${Prisma.raw(`'${bucketInterval}'`)}, "timestamp") as bucket_time,
        ${this.buildAggregation(query.op, query.field || "id", "log")}
        ${query.groupBy?.length ? Prisma.sql`, ${Prisma.raw(query.groupBy.map(g => `"${g}"`).join(", "))}` : Prisma.empty}
      FROM "LogRecord"
      ${whereClause}
      GROUP BY bucket_time ${query.groupBy?.length ? Prisma.sql`, ${Prisma.raw(query.groupBy.map(g => `"${g}"`).join(", "))}` : Prisma.empty}
      ORDER BY bucket_time ASC
      ${query.limit ? Prisma.sql`LIMIT ${query.limit}` : Prisma.empty}
    `;

    const rows = await prisma.$queryRaw<Array<{
      bucket_time: Date;
      value: bigint | number;
      [key: string]: unknown;
    }>>(sql);

    // Convert to series format with filled time buckets
    const series = this.convertToSeries(rows, query.groupBy, from, to, bucket);

    return {
      series,
      total: series.reduce((acc, s) => acc + s.data.reduce((a, d) => a + d.value, 0), 0),
      metadata: {
        source: "log",
        bucket,
        timeRange: {
          from: from.toISOString(),
          to: to.toISOString(),
        },
      },
    };
  }

  /**
   * Get default field for operation based on source
   */
  private static getDefaultField(
    op: MetricOp,
    source: "trace" | "span" | "log",
    providedField?: string
  ): string {
    if (providedField) return providedField;

    // Smart defaults based on operation and source
    switch (op) {
      case "sum":
        // Sum needs a numeric field - default to totalCost for spans
        if (source === "span") return "totalCost";
        if (source === "trace") return "durationMs";
        return "id"; // This will fail, but we need something
      case "avg":
      case "p50":
      case "p95":
      case "p99":
        // Latency operations
        if (source === "span") return "durationMs";
        if (source === "trace") return "durationMs";
        return "id";
      default:
        return "id";
    }
  }

  /**
   * Build aggregation SQL fragment
   */
  private static buildAggregation(
    op: MetricOp,
    field: string,
    source: "trace" | "span" | "log"
  ): Prisma.Sql {
    const prefix = source === "span" ? "s." : "";

    // Get the actual field to use (with smart defaults)
    const actualField = this.getDefaultField(op, source, field === "id" ? undefined : field);
    const quotedField = `${prefix}"${actualField}"`;

    switch (op) {
      case "count":
        return Prisma.sql`COUNT(*) as value`;
      case "sum":
        return Prisma.sql`COALESCE(SUM(${Prisma.raw(quotedField)}::numeric), 0) as value`;
      case "avg":
        return Prisma.sql`COALESCE(AVG(${Prisma.raw(quotedField)}::numeric), 0) as value`;
      case "p50":
        return Prisma.sql`COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${Prisma.raw(quotedField)}::numeric), 0) as value`;
      case "p95":
        return Prisma.sql`COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ${Prisma.raw(quotedField)}::numeric), 0) as value`;
      case "p99":
        return Prisma.sql`COALESCE(PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY ${Prisma.raw(quotedField)}::numeric), 0) as value`;
      case "unique_count":
        return Prisma.sql`COUNT(DISTINCT ${Prisma.raw(quotedField)}) as value`;
      case "rate":
        // Rate per minute
        return Prisma.sql`COUNT(*) / GREATEST(EXTRACT(EPOCH FROM (MAX(${Prisma.raw(prefix + '"startTime"')}) - MIN(${Prisma.raw(prefix + '"startTime"')}))) / 60, 1) as value`;
      case "error_rate":
        return source === "trace"
          ? Prisma.sql`COALESCE(SUM(CASE WHEN "hasError" THEN 1 ELSE 0 END)::FLOAT / NULLIF(COUNT(*), 0) * 100, 0) as value`
          : Prisma.sql`COALESCE(SUM(CASE WHEN ${Prisma.raw(prefix + '"statusCode"')} = 'ERROR' THEN 1 ELSE 0 END)::FLOAT / NULLIF(COUNT(*), 0) * 100, 0) as value`;
      case "ratio":
        // Custom ratio - requires field to be a boolean or condition
        return Prisma.sql`COALESCE(SUM(CASE WHEN ${Prisma.raw(quotedField)} THEN 1 ELSE 0 END)::FLOAT / NULLIF(COUNT(*), 0), 0) as value`;
      default:
        return Prisma.sql`COUNT(*) as value`;
    }
  }

  /**
   * Build WHERE clause for traces
   */
  private static buildTraceWhereClause(
    projectId: string,
    filters: GraphQuery["filters"],
    from: Date,
    to: Date
  ): Prisma.Sql {
    const conditions: Prisma.Sql[] = [
      Prisma.sql`"projectId" = ${projectId}`,
      Prisma.sql`"startTime" >= ${from}`,
      Prisma.sql`"startTime" < ${to}`,
    ];

    if (filters?.length) {
      for (const filter of filters) {
        conditions.push(this.buildFilterCondition(filter, ""));
      }
    }

    return Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`;
  }

  /**
   * Build WHERE clause for spans
   */
  private static buildSpanWhereClause(
    projectId: string,
    filters: GraphQuery["filters"],
    from: Date,
    to: Date
  ): Prisma.Sql {
    const conditions: Prisma.Sql[] = [
      Prisma.sql`t."projectId" = ${projectId}`,
      Prisma.sql`s."startTime" >= ${from}`,
      Prisma.sql`s."startTime" < ${to}`,
    ];

    if (filters?.length) {
      for (const filter of filters) {
        conditions.push(this.buildFilterCondition(filter, "s."));
      }
    }

    return Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`;
  }

  /**
   * Build WHERE clause for logs
   */
  private static buildLogWhereClause(
    projectId: string,
    filters: GraphQuery["filters"],
    from: Date,
    to: Date
  ): Prisma.Sql {
    const conditions: Prisma.Sql[] = [
      Prisma.sql`"projectId" = ${projectId}`,
      Prisma.sql`"timestamp" >= ${from}`,
      Prisma.sql`"timestamp" < ${to}`,
    ];

    if (filters?.length) {
      for (const filter of filters) {
        conditions.push(this.buildFilterCondition(filter, ""));
      }
    }

    return Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`;
  }

  /**
   * Build a single filter condition
   */
  private static buildFilterCondition(
    filter: NonNullable<GraphQuery["filters"]>[number],
    prefix: string
  ): Prisma.Sql {
    const quotedField = `${prefix}"${filter.field}"`;

    switch (filter.op) {
      case "eq":
        return Prisma.sql`${Prisma.raw(quotedField)} = ${filter.value}`;
      case "neq":
        return Prisma.sql`${Prisma.raw(quotedField)} != ${filter.value}`;
      case "gt":
        return Prisma.sql`${Prisma.raw(quotedField)} > ${filter.value}`;
      case "gte":
        return Prisma.sql`${Prisma.raw(quotedField)} >= ${filter.value}`;
      case "lt":
        return Prisma.sql`${Prisma.raw(quotedField)} < ${filter.value}`;
      case "lte":
        return Prisma.sql`${Prisma.raw(quotedField)} <= ${filter.value}`;
      case "in":
        if (Array.isArray(filter.value)) {
          return Prisma.sql`${Prisma.raw(quotedField)} = ANY(${filter.value})`;
        }
        return Prisma.sql`${Prisma.raw(quotedField)} = ${filter.value}`;
      case "nin":
        if (Array.isArray(filter.value)) {
          return Prisma.sql`NOT (${Prisma.raw(quotedField)} = ANY(${filter.value}))`;
        }
        return Prisma.sql`${Prisma.raw(quotedField)} != ${filter.value}`;
      case "contains":
        return Prisma.sql`${Prisma.raw(quotedField)} ILIKE ${"%" + String(filter.value) + "%"}`;
      default:
        return Prisma.sql`TRUE`;
    }
  }

  /**
   * Get PostgreSQL interval from bucket
   * NOTE: DATE_TRUNC only accepts single intervals (minute, hour, day).
   * For multi-minute buckets, we use 'minute' and handle grouping in SQL.
   */
  private static getBucketInterval(bucket: Bucket): string {
    switch (bucket) {
      case "1m":
        return "minute";
      case "5m":
      case "15m":
        return "minute"; // We'll group by minute, then aggregate in convertToSeries if needed
      case "1h":
      case "6h":
        return "hour";
      case "1d":
        return "day";
      default:
        return "hour";
    }
  }

  /**
   * Get bucket multiplier for grouping
   */
  private static getBucketMultiplier(bucket: Bucket): number {
    switch (bucket) {
      case "5m":
        return 5;
      case "15m":
        return 15;
      case "6h":
        return 6;
      default:
        return 1;
    }
  }

  /**
   * Convert raw query result to series format with filled time buckets
   */
  private static convertToSeries(
    rows: Array<{ bucket_time: Date; value: bigint | number; [key: string]: unknown }>,
    groupBy?: string[],
    from?: Date,
    to?: Date,
    bucket?: Bucket
  ): GraphSeries[] {
    // Generate all time buckets for the range
    const allBuckets = from && to && bucket
      ? this.generateTimeBuckets(from, to, bucket)
      : [];

    if (!groupBy?.length) {
      // Single series - fill missing buckets with zeros
      const dataMap = new Map<string, number>();
      for (const row of rows) {
        const timeKey = row.bucket_time.toISOString();
        dataMap.set(timeKey, typeof row.value === "bigint" ? Number(row.value) : Number(row.value));
      }

      // If we have generated buckets, use them; otherwise use data as-is
      const data = allBuckets.length > 0
        ? allBuckets.map((time) => ({
            time,
            value: dataMap.get(time) ?? 0,
          }))
        : rows.map((row) => ({
            time: row.bucket_time.toISOString(),
            value: typeof row.value === "bigint" ? Number(row.value) : Number(row.value),
          }));

      return [{ label: "Total", data }];
    }

    // Group by the groupBy fields
    const seriesMap = new Map<string, Map<string, number>>();

    for (const row of rows) {
      const label = groupBy.map((g) => String(row[g] ?? "unknown")).join(" / ");

      if (!seriesMap.has(label)) {
        seriesMap.set(label, new Map());
      }

      const timeKey = row.bucket_time.toISOString();
      seriesMap.get(label)!.set(
        timeKey,
        typeof row.value === "bigint" ? Number(row.value) : Number(row.value)
      );
    }

    // Convert to series with filled buckets
    return Array.from(seriesMap.entries()).map(([label, dataMap]) => ({
      label,
      data: allBuckets.length > 0
        ? allBuckets.map((time) => ({
            time,
            value: dataMap.get(time) ?? 0,
          }))
        : Array.from(dataMap.entries()).map(([time, value]) => ({ time, value })),
    }));
  }

  /**
   * Generate all time buckets for a time range
   */
  private static generateTimeBuckets(from: Date, to: Date, bucket: Bucket): string[] {
    const buckets: string[] = [];
    const intervalMs = bucketToMs(bucket);

    // Truncate 'from' to bucket boundary
    let current = this.truncateToBucket(from, bucket);
    const endTime = to.getTime();

    while (current.getTime() < endTime) {
      buckets.push(current.toISOString());
      current = new Date(current.getTime() + intervalMs);
    }

    return buckets;
  }

  /**
   * Truncate a date to the nearest bucket boundary
   */
  private static truncateToBucket(date: Date, bucket: Bucket): Date {
    const d = new Date(date);

    switch (bucket) {
      case "1m":
        d.setSeconds(0, 0);
        break;
      case "5m":
        d.setMinutes(Math.floor(d.getMinutes() / 5) * 5, 0, 0);
        break;
      case "15m":
        d.setMinutes(Math.floor(d.getMinutes() / 15) * 15, 0, 0);
        break;
      case "1h":
        d.setMinutes(0, 0, 0);
        break;
      case "6h":
        d.setHours(Math.floor(d.getHours() / 6) * 6, 0, 0, 0);
        break;
      case "1d":
        d.setHours(0, 0, 0, 0);
        break;
      default:
        d.setMinutes(0, 0, 0);
    }

    return d;
  }

  /**
   * Get project summaries for workspace overview
   */
  static async getProjectSummaries(
    workspaceId: string,
    from: Date,
    to: Date
  ): Promise<Array<{
    projectId: string;
    projectName: string;
    traceCount: number;
    errorRate: number;
    avgLatency: number;
    p95Latency: number;
    tokenCount: number;
    costUsd: number;
    lastActiveAt: Date | null;
  }>> {
    const sql = Prisma.sql`
      SELECT
        p."id" as "projectId",
        p."name" as "projectName",
        COALESCE(COUNT(t."id"), 0)::INT as "traceCount",
        COALESCE(
          SUM(CASE WHEN t."hasError" THEN 1 ELSE 0 END)::FLOAT / NULLIF(COUNT(t."id"), 0) * 100,
          0
        ) as "errorRate",
        COALESCE(AVG(t."durationMs"), 0) as "avgLatency",
        COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY t."durationMs"), 0) as "p95Latency",
        COALESCE(SUM(
          (SELECT COALESCE(SUM(s."totalTokens"), 0) FROM "Span" s WHERE s."traceId" = t."id")
        ), 0)::INT as "tokenCount",
        COALESCE(SUM(
          (SELECT COALESCE(SUM(s."totalCost"), 0) FROM "Span" s WHERE s."traceId" = t."id")
        ), 0)::FLOAT as "costUsd",
        MAX(t."startTime") as "lastActiveAt"
      FROM "Project" p
      LEFT JOIN "Trace" t ON t."projectId" = p."id"
        AND t."startTime" >= ${from}
        AND t."startTime" < ${to}
      WHERE p."workspaceId" = ${workspaceId}
      GROUP BY p."id", p."name"
      ORDER BY "traceCount" DESC
    `;

    const rows = await prisma.$queryRaw<Array<{
      projectId: string;
      projectName: string;
      traceCount: bigint;
      errorRate: number;
      avgLatency: number;
      p95Latency: number;
      tokenCount: bigint;
      costUsd: number;
      lastActiveAt: Date | null;
    }>>(sql);

    return rows.map((row) => ({
      projectId: row.projectId,
      projectName: row.projectName,
      traceCount: Number(row.traceCount),
      errorRate: Number(row.errorRate),
      avgLatency: Number(row.avgLatency),
      p95Latency: Number(row.p95Latency),
      tokenCount: Number(row.tokenCount),
      costUsd: Number(row.costUsd),
      lastActiveAt: row.lastActiveAt,
    }));
  }
}
