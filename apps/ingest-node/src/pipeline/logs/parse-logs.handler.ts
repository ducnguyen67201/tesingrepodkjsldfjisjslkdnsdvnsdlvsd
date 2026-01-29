/**
 * Parse Logs Handler
 *
 * First handler in the logs pipeline. Responsible for:
 * 1. Decompressing gzip-encoded payloads
 * 2. Parsing protobuf or JSON OTLP logs requests
 * 3. Validating the basic request structure
 */
import { gunzipSync } from "node:zlib";
import { OtlpLogsExportRequestSchema } from "@ducsigr/api/schemas";
import { logger } from "../../lib/logger.js";
import type {
  LogsPipelineContext,
  LogsPipelineHandler,
  LogsHandlerResult,
} from "./types.js";
import { LogsPipelineErrorCodes } from "./types.js";
import { parseOtlpLogsProtobuf } from "../../lib/otlp-logs-proto.js";

const SUPPORTED_CONTENT_TYPES = [
  "application/x-protobuf",
  "application/json",
] as const;

type SupportedContentType = (typeof SUPPORTED_CONTENT_TYPES)[number];

/**
 * Parse Logs Handler - Parses OTLP Logs requests (protobuf or JSON)
 */
export class ParseLogsHandler implements LogsPipelineHandler {
  readonly name = "ParseLogsHandler";

  async handle(ctx: LogsPipelineContext): Promise<LogsHandlerResult> {
    // 1. Validate content type
    const contentType = this.extractContentType(ctx.contentType);
    if (!contentType) {
      logger.warn(
        { contentType: ctx.contentType },
        "Unsupported content type for logs"
      );
      return {
        continue: false,
        error: {
          code: LogsPipelineErrorCodes.INVALID_CONTENT_TYPE,
          message: `Unsupported content type: ${ctx.contentType}. Supported: ${SUPPORTED_CONTENT_TYPES.join(", ")}`,
          httpStatus: 415,
        },
      };
    }

    // 2. Decompress if needed
    let payload: Buffer;
    try {
      payload = this.decompressPayload(ctx.rawBody, ctx.contentEncoding);
    } catch (error) {
      logger.error({ error }, "Failed to decompress logs payload");
      return {
        continue: false,
        error: {
          code: LogsPipelineErrorCodes.DECOMPRESSION_ERROR,
          message: "Failed to decompress gzip payload",
          httpStatus: 400,
        },
      };
    }

    // 3. Parse based on content type
    try {
      if (contentType === "application/x-protobuf") {
        ctx.parsedRequest = await this.parseProtobuf(payload);
      } else {
        ctx.parsedRequest = this.parseJson(payload);
      }
    } catch (error) {
      logger.error({ error, contentType }, "Failed to parse OTLP logs request");
      return {
        continue: false,
        error: {
          code: LogsPipelineErrorCodes.PARSE_ERROR,
          message: `Failed to parse ${contentType} payload`,
          httpStatus: 400,
          details: {
            parseError: error instanceof Error ? error.message : String(error),
          },
        },
      };
    }

    const logRecordCount = this.countLogRecords(ctx.parsedRequest);
    logger.debug(
      {
        resourceLogsCount: ctx.parsedRequest.resourceLogs.length,
        logRecordCount,
        contentType,
        compressed: ctx.contentEncoding === "gzip",
      },
      "Successfully parsed OTLP logs request"
    );

    return { continue: true };
  }

  /**
   * Extract and validate content type
   */
  private extractContentType(
    rawContentType: string
  ): SupportedContentType | null {
    const normalized = rawContentType.toLowerCase().split(";")[0]?.trim();
    if (
      normalized === "application/x-protobuf" ||
      normalized === "application/json"
    ) {
      return normalized;
    }
    return null;
  }

  /**
   * Decompress gzip payload if needed
   */
  private decompressPayload(body: Buffer, encoding: string): Buffer {
    if (encoding === "gzip") {
      return gunzipSync(body);
    }
    return body;
  }

  /**
   * Parse protobuf payload
   */
  private async parseProtobuf(
    payload: Buffer
  ): Promise<ReturnType<typeof OtlpLogsExportRequestSchema.parse>> {
    const decoded = await parseOtlpLogsProtobuf(payload);
    // Validate with Zod schema
    return OtlpLogsExportRequestSchema.parse(decoded);
  }

  /**
   * Parse JSON payload
   */
  private parseJson(
    payload: Buffer
  ): ReturnType<typeof OtlpLogsExportRequestSchema.parse> {
    const json: unknown = JSON.parse(payload.toString("utf-8"));
    // Validate with Zod schema
    return OtlpLogsExportRequestSchema.parse(json);
  }

  /**
   * Count total log records in the request
   */
  private countLogRecords(
    request: ReturnType<typeof OtlpLogsExportRequestSchema.parse>
  ): number {
    let count = 0;
    for (const resourceLogs of request.resourceLogs) {
      for (const scopeLogs of resourceLogs.scopeLogs) {
        count += scopeLogs.logRecords.length;
      }
    }
    return count;
  }
}
