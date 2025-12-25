/**
 * Log Filter Service
 *
 * Builds Prisma WHERE clauses from LogFilterExpression DSL.
 * Handles AND/OR/NOT recursively, field predicates, attribute predicates,
 * and full-text search on log body.
 *
 * @see packages/api/src/schemas/log-filtering.ts
 */

import { Prisma } from "@cognobserve/db";
import type {
  LogFilterExpression,
  LogFieldPredicate,
  LogAttributePredicate,
  LogSearchPredicate,
} from "../schemas/log-filtering";
import { logFieldToColumn } from "../schemas/log-filtering";

/**
 * LogFilterService - builds Prisma WHERE clause from LogFilterExpression
 */
export class LogFilterService {
  /**
   * Build Prisma WHERE clause from LogFilterExpression
   */
  static buildWhereClause(
    projectIds: string[],
    timeRange: { from: string; to: string },
    expr?: LogFilterExpression
  ): Prisma.LogRecordWhereInput {
    const baseWhere: Prisma.LogRecordWhereInput = {
      projectId: { in: projectIds },
      timestamp: {
        gte: new Date(timeRange.from),
        lte: new Date(timeRange.to),
      },
    };

    if (!expr) return baseWhere;

    const filterWhere = this.expressionToWhere(expr);
    return { AND: [baseWhere, filterWhere] };
  }

  /**
   * Convert LogFilterExpression to Prisma WHERE clause recursively
   */
  private static expressionToWhere(
    expr: LogFilterExpression
  ): Prisma.LogRecordWhereInput {
    // Handle AND
    if ("and" in expr) {
      return { AND: expr.and.map((e) => this.expressionToWhere(e)) };
    }

    // Handle OR
    if ("or" in expr) {
      return { OR: expr.or.map((e) => this.expressionToWhere(e)) };
    }

    // Handle NOT
    if ("not" in expr) {
      return { NOT: this.expressionToWhere(expr.not) };
    }

    // Handle field predicate
    if ("field" in expr) {
      return this.fieldPredicateToWhere(expr);
    }

    // Handle attribute predicate
    if ("attribute" in expr) {
      return this.attributePredicateToWhere(expr);
    }

    // Handle search predicate
    if ("search" in expr) {
      return this.searchPredicateToWhere(expr);
    }

    return {};
  }

  /**
   * Convert field predicate to Prisma WHERE
   */
  private static fieldPredicateToWhere(
    predicate: LogFieldPredicate
  ): Prisma.LogRecordWhereInput {
    const { field, op, value } = predicate;
    const column = logFieldToColumn(field);

    switch (op) {
      case "eq":
        return { [column]: value };
      case "neq":
        return { [column]: { not: value } };
      case "gt":
        return { [column]: { gt: value } };
      case "gte":
        return { [column]: { gte: value } };
      case "lt":
        return { [column]: { lt: value } };
      case "lte":
        return { [column]: { lte: value } };
      case "in":
        return { [column]: { in: value as (string | number)[] } };
      case "nin":
        return { [column]: { notIn: value as (string | number)[] } };
      case "contains":
        return { [column]: { contains: value as string, mode: "insensitive" } };
      case "prefix":
        return { [column]: { startsWith: value as string, mode: "insensitive" } };
      case "exists":
        return { [column]: { not: null } };
      default:
        return {};
    }
  }

  /**
   * Convert attribute predicate to Prisma WHERE (JSONB path query)
   */
  private static attributePredicateToWhere(
    predicate: LogAttributePredicate
  ): Prisma.LogRecordWhereInput {
    const { scope, key, op, value } = predicate.attribute;
    const column = scope === "resource" ? "resource" : "attributes";

    // Prisma JSONB path query
    const jsonOp = this.opToPrismaJsonOp(op);

    return {
      [column]: {
        path: [key],
        [jsonOp]: value,
      },
    };
  }

  /**
   * Convert search predicate to Prisma WHERE
   */
  private static searchPredicateToWhere(
    predicate: LogSearchPredicate
  ): Prisma.LogRecordWhereInput {
    const { query, mode } = predicate.search;

    if (mode === "phrase") {
      // Phrase search - exact match (still case insensitive)
      return { bodyText: { contains: query, mode: "insensitive" } };
    }

    // Terms search - split by spaces and AND them together
    const terms = query.split(/\s+/).filter((t) => t.length > 0);
    if (terms.length === 0) {
      return {};
    }

    if (terms.length === 1) {
      return { bodyText: { contains: terms[0], mode: "insensitive" } };
    }

    return {
      AND: terms.map((term) => ({
        bodyText: { contains: term, mode: "insensitive" as const },
      })),
    };
  }

  /**
   * Map operator to Prisma JSON operation
   */
  private static opToPrismaJsonOp(op: string): string {
    const mapping: Record<string, string> = {
      eq: "equals",
      neq: "not",
      gt: "gt",
      gte: "gte",
      lt: "lt",
      lte: "lte",
      contains: "string_contains",
    };
    return mapping[op] ?? "equals";
  }
}
