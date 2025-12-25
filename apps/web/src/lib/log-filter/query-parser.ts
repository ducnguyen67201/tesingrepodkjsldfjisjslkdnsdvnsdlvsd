/**
 * Log Query Parser
 *
 * Parses query builder input strings into LogFilterExpression.
 * Supports syntax: field=value AND field2>=value2 OR body contains "text"
 */

import type { LogFilterExpression, FilterOperator } from "@cognobserve/api/schemas";
import { LogFieldSchema } from "@cognobserve/api/schemas";

/**
 * Parse a query string into a LogFilterExpression
 *
 * @example
 * parseQueryToFilter('log.serviceName="api"')
 * // Returns: { field: "log.serviceName", op: "eq", value: "api" }
 *
 * @example
 * parseQueryToFilter('log.serviceName="api" AND log.severityNumber>=17')
 * // Returns: { and: [{ field: "log.serviceName", op: "eq", value: "api" }, { field: "log.severityNumber", op: "gte", value: 17 }] }
 */
export function parseQueryToFilter(query: string): LogFilterExpression | null {
  if (!query.trim()) return null;

  const trimmed = query.trim();

  // Simple parsing: field=value AND field2=value2
  const parts = trimmed.split(/\s+(AND|OR)\s+/i);
  const expressions: LogFilterExpression[] = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]?.trim() ?? "";
    if (!part || part.toUpperCase() === "AND" || part.toUpperCase() === "OR") {
      continue;
    }

    // Match field<op>value pattern
    const opMatch = part.match(/^([a-zA-Z][a-zA-Z0-9_.]*)(>=|<=|!=|<>|==|=|>|<)(.+)$/);
    if (opMatch) {
      const field = opMatch[1];
      const operator = opMatch[2];
      const rawValue = opMatch[3];

      // Skip if regex didn't capture all groups
      if (!field || !operator || !rawValue) {
        continue;
      }

      let value: string | number = rawValue.trim();

      // Remove quotes
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      // Convert to number if numeric
      if (/^\d+$/.test(value)) {
        value = parseInt(value, 10);
      }

      // Map operator
      const opMap: Record<string, FilterOperator> = {
        "=": "eq",
        "==": "eq",
        "!=": "neq",
        "<>": "neq",
        ">": "gt",
        ">=": "gte",
        "<": "lt",
        "<=": "lte",
      };

      // Validate field with Zod schema
      const fieldResult = LogFieldSchema.safeParse(field);
      if (fieldResult.success) {
        expressions.push({
          field: fieldResult.data,
          op: opMap[operator] ?? "eq",
          value,
        });
      } else {
        // Invalid field - treat as body search instead
        expressions.push({
          search: { query: part, mode: "terms" },
        });
      }
    } else {
      // Treat as body search
      expressions.push({
        search: { query: part, mode: "terms" },
      });
    }
  }

  if (expressions.length === 0) return null;
  if (expressions.length === 1) return expressions[0]!;

  // Check for OR in original query
  if (/\s+OR\s+/i.test(trimmed)) {
    return { or: expressions };
  }
  return { and: expressions };
}

/**
 * Convert a LogFilterExpression back to a query string for display
 */
export function filterToQueryString(filter: LogFilterExpression | null): string {
  if (!filter) return "";

  const predicateToString = (expr: LogFilterExpression): string => {
    if ("and" in expr) {
      return expr.and.map(predicateToString).join(" AND ");
    }
    if ("or" in expr) {
      return expr.or.map(predicateToString).join(" OR ");
    }
    if ("not" in expr) {
      return `NOT (${predicateToString(expr.not)})`;
    }
    if ("field" in expr) {
      const opMap: Record<FilterOperator, string> = {
        eq: "=",
        neq: "!=",
        gt: ">",
        gte: ">=",
        lt: "<",
        lte: "<=",
        in: "in",
        nin: "not in",
        exists: "exists",
        prefix: "^",
        contains: "~",
      };
      const value = typeof expr.value === "string" ? `"${expr.value}"` : expr.value;
      return `${expr.field}${opMap[expr.op]}${value ?? ""}`;
    }
    if ("search" in expr) {
      return expr.search.query;
    }
    if ("attribute" in expr) {
      const value = typeof expr.attribute.value === "string"
        ? `"${expr.attribute.value}"`
        : expr.attribute.value;
      return `${expr.attribute.scope}.${expr.attribute.key}=${value ?? ""}`;
    }
    return "";
  };

  return predicateToString(filter);
}
