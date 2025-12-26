/**
 * Normalize Logs Handler
 *
 * Transforms OTLP log structure to normalized log records.
 * Flattens the hierarchy: resourceLogs → scopeLogs → logRecords
 * Extracts service metadata from resource attributes.
 */
import type {
  OtlpLogRecord,
  OtlpAnyValue,
  NormalizedLogRecord,
} from "@ducsigr/api/schemas";
import { logger } from "../../lib/logger.js";
import type {
  LogsPipelineContext,
  LogsPipelineHandler,
  LogsHandlerResult,
} from "./types.js";

/**
 * Normalize Logs Handler - Flattens OTLP logs to normalized records
 */
export class NormalizeLogsHandler implements LogsPipelineHandler {
  readonly name = "NormalizeLogsHandler";

  async handle(ctx: LogsPipelineContext): Promise<LogsHandlerResult> {
    if (!ctx.parsedRequest) {
      return {
        continue: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "No parsed request in context",
          httpStatus: 500,
        },
      };
    }

    const normalizedLogs: NormalizedLogRecord[] = [];

    for (const resourceLogs of ctx.parsedRequest.resourceLogs) {
      const resourceAttrs = this.flattenAttributes(
        resourceLogs.resource?.attributes ?? []
      );
      const serviceName = this.extractStringAttr(resourceAttrs, "service.name");
      const serviceVersion = this.extractStringAttr(
        resourceAttrs,
        "service.version"
      );
      const environment = this.extractStringAttr(
        resourceAttrs,
        "deployment.environment"
      );

      for (const scopeLogs of resourceLogs.scopeLogs) {
        const scopeName = scopeLogs.scope?.name;
        const scopeVersion = scopeLogs.scope?.version;

        for (const logRecord of scopeLogs.logRecords) {
          const normalized = this.normalizeLogRecord(
            logRecord,
            resourceAttrs,
            serviceName,
            serviceVersion,
            environment,
            scopeName,
            scopeVersion
          );
          normalizedLogs.push(normalized);
        }
      }
    }

    ctx.normalizedLogs = normalizedLogs;

    logger.debug(
      { logCount: normalizedLogs.length },
      "Normalized logs from OTLP request"
    );

    return { continue: true };
  }

  /**
   * Normalize a single log record
   */
  private normalizeLogRecord(
    logRecord: OtlpLogRecord,
    resourceAttrs: Record<string, unknown>,
    serviceName: string | undefined,
    serviceVersion: string | undefined,
    environment: string | undefined,
    scopeName: string | undefined,
    scopeVersion: string | undefined
  ): NormalizedLogRecord {
    // Parse timestamps
    const timestamp = this.parseNanoTimestamp(
      logRecord.timeUnixNano ?? logRecord.observedTimeUnixNano
    );
    const observedTime = logRecord.observedTimeUnixNano
      ? this.parseNanoTimestamp(logRecord.observedTimeUnixNano)
      : undefined;

    // Extract body text
    const bodyText = this.extractBodyText(logRecord.body);

    // Flatten log attributes
    const attributes = this.flattenAttributes(logRecord.attributes ?? []);

    return {
      projectId: "", // Will be set by auth handler
      serviceName,
      serviceVersion,
      environment,
      resource: resourceAttrs,
      scopeName,
      scopeVersion,
      timestamp,
      observedTime,
      severityNumber: logRecord.severityNumber,
      severityText: logRecord.severityText,
      body: logRecord.body,
      bodyText,
      attributes,
      droppedAttributesCount: logRecord.droppedAttributesCount,
      traceId: logRecord.traceId,
      spanId: logRecord.spanId,
      flags: logRecord.flags,
    };
  }

  /**
   * Parse nano timestamp to Date
   */
  private parseNanoTimestamp(nanoStr: string | undefined): Date {
    if (!nanoStr) {
      return new Date();
    }
    const nanos = BigInt(nanoStr);
    const millis = Number(nanos / BigInt(1_000_000));
    return new Date(millis);
  }

  /**
   * Extract text representation from body AnyValue
   */
  private extractBodyText(body: OtlpAnyValue | undefined): string | undefined {
    if (!body) return undefined;

    if (body.stringValue !== undefined) {
      return body.stringValue;
    }
    if (body.boolValue !== undefined) {
      return String(body.boolValue);
    }
    if (body.intValue !== undefined) {
      return String(body.intValue);
    }
    if (body.doubleValue !== undefined) {
      return String(body.doubleValue);
    }
    if (body.bytesValue !== undefined) {
      return body.bytesValue;
    }
    // For arrays and kvlists, stringify
    if (body.arrayValue || body.kvlistValue) {
      return JSON.stringify(body);
    }

    return undefined;
  }

  /**
   * Flatten OTLP KeyValue array to a plain object
   */
  private flattenAttributes(
    attrs: Array<{ key: string; value: OtlpAnyValue }>
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const attr of attrs) {
      result[attr.key] = this.extractValue(attr.value);
    }

    return result;
  }

  /**
   * Extract value from AnyValue
   */
  private extractValue(value: OtlpAnyValue): unknown {
    if (value.stringValue !== undefined) return value.stringValue;
    if (value.boolValue !== undefined) return value.boolValue;
    if (value.intValue !== undefined) return value.intValue;
    if (value.doubleValue !== undefined) return value.doubleValue;
    if (value.bytesValue !== undefined) return value.bytesValue;
    if (value.arrayValue) {
      return value.arrayValue.values?.map((v) =>
        this.extractValue(v as OtlpAnyValue)
      );
    }
    if (value.kvlistValue) {
      const obj: Record<string, unknown> = {};
      for (const kv of value.kvlistValue.values ?? []) {
        obj[kv.key] = this.extractValue(kv.value as OtlpAnyValue);
      }
      return obj;
    }
    return null;
  }

  /**
   * Extract a string attribute value
   */
  private extractStringAttr(
    attrs: Record<string, unknown>,
    key: string
  ): string | undefined {
    const value = attrs[key];
    return typeof value === "string" ? value : undefined;
  }
}
