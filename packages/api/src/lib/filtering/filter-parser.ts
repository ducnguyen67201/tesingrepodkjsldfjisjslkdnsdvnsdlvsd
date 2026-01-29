/**
 * Filter Parser
 *
 * Converts FilterExpression DSL to Prisma where clauses and SQL fragments.
 * Handles recursive AND/OR/NOT, field predicates, attribute predicates,
 * event predicates, and full-text search.
 *
 * @see docs/specs/tracing/TRACING_FILTERING_SEARCH_V2_SPEC.md
 */
import { Prisma } from "@ducsigr/db";
import {
  type FilterExpression,
  type FilterOperator,
  type PredicateValue,
  type FieldPredicate,
  type AttributePredicate,
  type EventPredicate,
  type SearchPredicate,
  isTraceField,
  isSpanField,
  fieldToColumn,
  validateFilterGuardrails,
} from "../../schemas/filtering";

// ============================================================================
// Types
// ============================================================================

/**
 * Parsed filter result containing Prisma where clauses
 */
export interface ParsedFilter {
  /** Where clause for Trace table */
  traceWhere: Prisma.TraceWhereInput;
  /** Where clause for Span table (for EXISTS subquery) */
  spanWhere: Prisma.SpanWhereInput | null;
  /** Whether the filter has any span predicates */
  hasSpanPredicates: boolean;
  /** Raw SQL fragments for complex queries (if needed) */
  rawSql: Prisma.Sql | null;
}

/**
 * Parse options
 */
export interface ParseOptions {
  /** Whether to skip guardrail validation */
  skipValidation?: boolean;
}

// ============================================================================
// Filter Parser Class
// ============================================================================

export class FilterParser {
  /**
   * Parse a FilterExpression into Prisma where clauses
   */
  parse(expr: FilterExpression, options: ParseOptions = {}): ParsedFilter {
    // Validate guardrails
    if (!options.skipValidation) {
      const validation = validateFilterGuardrails(expr);
      if (!validation.valid) {
        throw new Error(`Filter validation failed: ${validation.errors.join(", ")}`);
      }
    }

    // Separate trace and span predicates
    const { tracePredicates, spanPredicates } = this.separatePredicates(expr);

    // Build where clauses
    const traceWhere: Prisma.TraceWhereInput = tracePredicates
      ? this.buildTraceWhereClause(tracePredicates)
      : {};
    const spanWhere: Prisma.SpanWhereInput | null = spanPredicates
      ? this.buildSpanWhereClause(spanPredicates)
      : null;

    return {
      traceWhere,
      spanWhere,
      hasSpanPredicates: spanWhere !== null,
      rawSql: null,
    };
  }

  /**
   * Separate trace-level and span-level predicates
   */
  private separatePredicates(expr: FilterExpression): {
    tracePredicates: FilterExpression | null;
    spanPredicates: FilterExpression | null;
  } {
    const traceExprs: FilterExpression[] = [];
    const spanExprs: FilterExpression[] = [];

    this.collectPredicatesByScope(expr, traceExprs, spanExprs);

    return {
      tracePredicates: traceExprs.length > 0
        ? traceExprs.length === 1
          ? traceExprs[0]!
          : { and: traceExprs }
        : null,
      spanPredicates: spanExprs.length > 0
        ? spanExprs.length === 1
          ? spanExprs[0]!
          : { and: spanExprs }
        : null,
    };
  }

  /**
   * Recursively collect predicates by scope (trace vs span)
   */
  private collectPredicatesByScope(
    expr: FilterExpression,
    traceExprs: FilterExpression[],
    spanExprs: FilterExpression[]
  ): void {
    if ("and" in expr) {
      // For AND, we can split predicates by scope
      for (const child of expr.and) {
        this.collectPredicatesByScope(child, traceExprs, spanExprs);
      }
    } else if ("or" in expr) {
      // For OR, we need to check if all children are same scope
      const scope = this.getExpressionScope(expr);
      if (scope === "trace") {
        traceExprs.push(expr);
      } else if (scope === "span") {
        spanExprs.push(expr);
      } else {
        // Mixed scope OR - add to both (will be handled in query)
        traceExprs.push(expr);
        spanExprs.push(expr);
      }
    } else if ("not" in expr) {
      const scope = this.getExpressionScope(expr.not);
      if (scope === "trace") {
        traceExprs.push(expr);
      } else if (scope === "span") {
        spanExprs.push(expr);
      } else {
        traceExprs.push(expr);
        spanExprs.push(expr);
      }
    } else if ("field" in expr) {
      if (isTraceField(expr.field)) {
        traceExprs.push(expr);
      } else if (isSpanField(expr.field)) {
        spanExprs.push(expr);
      }
    } else if ("attribute" in expr) {
      if (expr.attribute.scope === "resource") {
        traceExprs.push(expr);
      } else {
        spanExprs.push(expr);
      }
    } else if ("event" in expr) {
      // Events are span-level
      spanExprs.push(expr);
    } else if ("search" in expr) {
      // Search can apply to both
      if (expr.search.scope === "trace") {
        traceExprs.push(expr);
      } else if (expr.search.scope === "span") {
        spanExprs.push(expr);
      } else {
        // "both" - add to both
        traceExprs.push(expr);
        spanExprs.push(expr);
      }
    }
  }

  /**
   * Determine the scope of an expression (trace, span, or mixed)
   */
  private getExpressionScope(expr: FilterExpression): "trace" | "span" | "mixed" {
    if ("and" in expr || "or" in expr) {
      const children = "and" in expr ? expr.and : expr.or;
      const scopes = children.map((c) => this.getExpressionScope(c));
      const uniqueScopes = new Set(scopes);
      if (uniqueScopes.size === 1) {
        return scopes[0]!;
      }
      return "mixed";
    }
    if ("not" in expr) {
      return this.getExpressionScope(expr.not);
    }
    if ("field" in expr) {
      return isTraceField(expr.field) ? "trace" : "span";
    }
    if ("attribute" in expr) {
      return expr.attribute.scope === "resource" ? "trace" : "span";
    }
    if ("event" in expr) {
      return "span";
    }
    if ("search" in expr) {
      if (expr.search.scope === "trace") return "trace";
      if (expr.search.scope === "span") return "span";
      return "mixed";
    }
    return "mixed";
  }

  /**
   * Build Prisma where clause for Trace from expression
   */
  private buildTraceWhereClause(expr: FilterExpression): Prisma.TraceWhereInput {
    if ("and" in expr) {
      return {
        AND: expr.and.map((e) => this.buildTraceWhereClause(e)),
      };
    }

    if ("or" in expr) {
      return {
        OR: expr.or.map((e) => this.buildTraceWhereClause(e)),
      };
    }

    if ("not" in expr) {
      return {
        NOT: this.buildTraceWhereClause(expr.not),
      };
    }

    if ("field" in expr) {
      return this.buildTraceFieldPredicate(expr);
    }

    if ("attribute" in expr) {
      return this.buildTraceAttributePredicate(expr);
    }

    if ("search" in expr) {
      return this.buildTraceSearchPredicate(expr);
    }

    // Event predicates are span-level only
    return {};
  }

  /**
   * Build Prisma where clause for Span from expression
   */
  private buildSpanWhereClause(expr: FilterExpression): Prisma.SpanWhereInput {
    if ("and" in expr) {
      return {
        AND: expr.and.map((e) => this.buildSpanWhereClause(e)),
      };
    }

    if ("or" in expr) {
      return {
        OR: expr.or.map((e) => this.buildSpanWhereClause(e)),
      };
    }

    if ("not" in expr) {
      return {
        NOT: this.buildSpanWhereClause(expr.not),
      };
    }

    if ("field" in expr) {
      return this.buildSpanFieldPredicate(expr);
    }

    if ("attribute" in expr) {
      return this.buildSpanAttributePredicate(expr);
    }

    if ("event" in expr) {
      return this.buildEventPredicate(expr);
    }

    if ("search" in expr) {
      return this.buildSpanSearchPredicate(expr);
    }

    return {};
  }

  /**
   * Build trace field predicate
   */
  private buildTraceFieldPredicate(pred: FieldPredicate): Prisma.TraceWhereInput {
    const column = fieldToColumn(pred.field);
    const condition = this.buildOperatorCondition(pred.op, pred.value);
    return { [column]: condition } as Prisma.TraceWhereInput;
  }

  /**
   * Build span field predicate
   */
  private buildSpanFieldPredicate(pred: FieldPredicate): Prisma.SpanWhereInput {
    const column = fieldToColumn(pred.field);
    const condition = this.buildOperatorCondition(pred.op, pred.value);
    return { [column]: condition } as Prisma.SpanWhereInput;
  }

  /**
   * Build trace attribute predicate (JSONB)
   */
  private buildTraceAttributePredicate(pred: AttributePredicate): Prisma.TraceWhereInput {
    const { key, op, value } = pred.attribute;

    if (op === "exists") {
      return {
        resource: {
          path: [key],
          not: Prisma.DbNull,
        },
      };
    }

    if (op === "eq" && value !== undefined) {
      return {
        resource: {
          path: [key],
          equals: value,
        },
      };
    }

    if (op === "neq" && value !== undefined) {
      return {
        NOT: {
          resource: {
            path: [key],
            equals: value,
          },
        },
      };
    }

    if (op === "contains" && typeof value === "string") {
      return {
        resource: {
          path: [key],
          string_contains: value,
        },
      };
    }

    return {};
  }

  /**
   * Build span attribute predicate (JSONB)
   */
  private buildSpanAttributePredicate(pred: AttributePredicate): Prisma.SpanWhereInput {
    const { key, op, value } = pred.attribute;

    if (op === "exists") {
      return {
        attributes: {
          path: [key],
          not: Prisma.DbNull,
        },
      };
    }

    if (op === "eq" && value !== undefined) {
      return {
        attributes: {
          path: [key],
          equals: value,
        },
      };
    }

    if (op === "neq" && value !== undefined) {
      return {
        NOT: {
          attributes: {
            path: [key],
            equals: value,
          },
        },
      };
    }

    if (op === "contains" && typeof value === "string") {
      return {
        attributes: {
          path: [key],
          string_contains: value,
        },
      };
    }

    return {};
  }

  /**
   * Build event predicate
   */
  private buildEventPredicate(pred: EventPredicate): Prisma.SpanWhereInput {
    const { name, attributeKey, op, value } = pred.event;

    // Events are stored as JSON array
    // For now, use a simplified approach with exception fields
    if (name === "exception" && attributeKey === "exception.type") {
      return {
        exceptionType: this.buildOperatorCondition(op, value),
      } as Prisma.SpanWhereInput;
    }

    if (name === "exception" && attributeKey === "exception.message") {
      return {
        exceptionMessage: this.buildOperatorCondition(op, value),
      } as Prisma.SpanWhereInput;
    }

    // Generic event matching would require raw SQL
    return {};
  }

  /**
   * Build trace search predicate
   */
  private buildTraceSearchPredicate(pred: SearchPredicate): Prisma.TraceWhereInput {
    const { query, mode } = pred.search;

    // Use searchText column with ILIKE for now
    if (mode === "phrase") {
      return {
        searchText: {
          contains: query,
          mode: "insensitive",
        },
      };
    }

    // Terms mode - split by whitespace and AND them
    const terms = query.split(/\s+/).filter((t) => t.length > 0);
    if (terms.length === 0) {
      return {};
    }

    if (terms.length === 1) {
      return {
        searchText: {
          contains: terms[0],
          mode: "insensitive",
        },
      };
    }

    return {
      AND: terms.map((term) => ({
        searchText: {
          contains: term,
          mode: "insensitive" as const,
        },
      })),
    };
  }

  /**
   * Build span search predicate
   */
  private buildSpanSearchPredicate(pred: SearchPredicate): Prisma.SpanWhereInput {
    const { query, mode } = pred.search;

    // Use searchText column with ILIKE for now
    if (mode === "phrase") {
      return {
        searchText: {
          contains: query,
          mode: "insensitive",
        },
      };
    }

    // Terms mode - split by whitespace and AND them
    const terms = query.split(/\s+/).filter((t) => t.length > 0);
    if (terms.length === 0) {
      return {};
    }

    if (terms.length === 1) {
      return {
        searchText: {
          contains: terms[0],
          mode: "insensitive",
        },
      };
    }

    return {
      AND: terms.map((term) => ({
        searchText: {
          contains: term,
          mode: "insensitive" as const,
        },
      })),
    };
  }

  /**
   * Build Prisma operator condition from FilterOperator
   */
  private buildOperatorCondition(
    op: FilterOperator,
    value?: PredicateValue
  ): unknown {
    switch (op) {
      case "eq":
        return value;
      case "neq":
        return { not: value };
      case "in":
        return { in: value as (string | number)[] };
      case "nin":
        return { notIn: value as (string | number)[] };
      case "gt":
        return { gt: value };
      case "gte":
        return { gte: value };
      case "lt":
        return { lt: value };
      case "lte":
        return { lte: value };
      case "exists":
        return { not: null };
      case "prefix":
        return { startsWith: value as string };
      case "contains":
        return { contains: value as string, mode: "insensitive" };
      default:
        return value;
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let _parser: FilterParser | null = null;

/**
 * Get the singleton FilterParser instance
 */
export const getFilterParser = (): FilterParser => {
  if (!_parser) {
    _parser = new FilterParser();
  }
  return _parser;
};
