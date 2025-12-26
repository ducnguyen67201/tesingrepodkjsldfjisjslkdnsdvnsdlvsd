/**
 * Parse Handler
 *
 * First handler in the pipeline. Responsible for:
 * 1. Decompressing gzip-encoded payloads
 * 2. Parsing protobuf or JSON OTLP requests
 * 3. Validating the basic request structure
 */
import { gunzipSync } from "node:zlib";
import { OtlpExportRequestSchema } from "@ducsigr/api/schemas";
import { logger } from "../../lib/logger.js";
import type {
  PipelineContext,
  PipelineHandler,
  HandlerResult,
} from "../types.js";
import { PipelineErrorCodes } from "../types.js";
import { parseOtlpProtobuf } from "../../lib/otlp-proto.js";

const SUPPORTED_CONTENT_TYPES = [
  "application/x-protobuf",
  "application/json",
] as const;

type SupportedContentType = (typeof SUPPORTED_CONTENT_TYPES)[number];

/**
 * Parse Handler - Parses OTLP requests (protobuf or JSON)
 */
export class ParseHandler implements PipelineHandler {
  readonly name = "ParseHandler";

  async handle(ctx: PipelineContext): Promise<HandlerResult> {
    // 1. Validate content type
    const contentType = this.extractContentType(ctx.contentType);
    if (!contentType) {
      logger.warn(
        { contentType: ctx.contentType },
        "Unsupported content type"
      );
      return {
        continue: false,
        error: {
          code: PipelineErrorCodes.INVALID_CONTENT_TYPE,
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
      logger.error({ error }, "Failed to decompress payload");
      return {
        continue: false,
        error: {
          code: PipelineErrorCodes.DECOMPRESSION_ERROR,
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
      logger.error({ error, contentType }, "Failed to parse OTLP request");
      return {
        continue: false,
        error: {
          code: PipelineErrorCodes.PARSE_ERROR,
          message: `Failed to parse ${contentType} payload`,
          httpStatus: 400,
          details: {
            parseError: error instanceof Error ? error.message : String(error),
          },
        },
      };
    }

    logger.debug(
      {
        resourceSpansCount: ctx.parsedRequest.resourceSpans.length,
        contentType,
        compressed: ctx.contentEncoding === "gzip",
      },
      "Successfully parsed OTLP request"
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
  ): Promise<ReturnType<typeof OtlpExportRequestSchema.parse>> {
    const decoded = await parseOtlpProtobuf(payload);
    // Validate with Zod schema
    return OtlpExportRequestSchema.parse(decoded);
  }

  /**
   * Parse JSON payload
   */
  private parseJson(
    payload: Buffer
  ): ReturnType<typeof OtlpExportRequestSchema.parse> {
    const json: unknown = JSON.parse(payload.toString("utf-8"));
    // Validate with Zod schema
    return OtlpExportRequestSchema.parse(json);
  }
}
