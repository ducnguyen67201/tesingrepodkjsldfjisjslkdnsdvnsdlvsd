/**
 * OTLP Protobuf Parser
 *
 * Handles decoding of OTLP protobuf binary payloads.
 * Uses protobufjs to dynamically parse the binary format.
 *
 * OTLP wire format uses the following message structure:
 * - ExportTraceServiceRequest
 *   - resourceSpans[]
 *     - resource
 *       - attributes[]
 *     - scopeSpans[]
 *       - scope
 *       - spans[]
 */
import * as protobuf from "protobufjs";
import { logger } from "./logger.js";

/**
 * OTLP Proto definitions embedded as JSON
 * This avoids needing external .proto files at runtime
 */
const OTLP_PROTO_JSON = {
  nested: {
    opentelemetry: {
      nested: {
        proto: {
          nested: {
            collector: {
              nested: {
                trace: {
                  nested: {
                    v1: {
                      nested: {
                        ExportTraceServiceRequest: {
                          fields: {
                            resourceSpans: { rule: "repeated", type: "opentelemetry.proto.trace.v1.ResourceSpans", id: 1 },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            common: {
              nested: {
                v1: {
                  nested: {
                    AnyValue: {
                      oneofs: {
                        value: { oneof: ["stringValue", "boolValue", "intValue", "doubleValue", "arrayValue", "kvlistValue", "bytesValue"] },
                      },
                      fields: {
                        stringValue: { type: "string", id: 1 },
                        boolValue: { type: "bool", id: 2 },
                        intValue: { type: "int64", id: 3 },
                        doubleValue: { type: "double", id: 4 },
                        arrayValue: { type: "ArrayValue", id: 5 },
                        kvlistValue: { type: "KeyValueList", id: 6 },
                        bytesValue: { type: "bytes", id: 7 },
                      },
                    },
                    ArrayValue: {
                      fields: {
                        values: { rule: "repeated", type: "AnyValue", id: 1 },
                      },
                    },
                    KeyValueList: {
                      fields: {
                        values: { rule: "repeated", type: "KeyValue", id: 1 },
                      },
                    },
                    KeyValue: {
                      fields: {
                        key: { type: "string", id: 1 },
                        value: { type: "AnyValue", id: 2 },
                      },
                    },
                    InstrumentationScope: {
                      fields: {
                        name: { type: "string", id: 1 },
                        version: { type: "string", id: 2 },
                        attributes: { rule: "repeated", type: "KeyValue", id: 3 },
                        droppedAttributesCount: { type: "uint32", id: 4 },
                      },
                    },
                  },
                },
              },
            },
            resource: {
              nested: {
                v1: {
                  nested: {
                    Resource: {
                      fields: {
                        attributes: { rule: "repeated", type: "opentelemetry.proto.common.v1.KeyValue", id: 1 },
                        droppedAttributesCount: { type: "uint32", id: 2 },
                      },
                    },
                  },
                },
              },
            },
            trace: {
              nested: {
                v1: {
                  nested: {
                    ResourceSpans: {
                      fields: {
                        resource: { type: "opentelemetry.proto.resource.v1.Resource", id: 1 },
                        scopeSpans: { rule: "repeated", type: "ScopeSpans", id: 2 },
                        schemaUrl: { type: "string", id: 3 },
                      },
                    },
                    ScopeSpans: {
                      fields: {
                        scope: { type: "opentelemetry.proto.common.v1.InstrumentationScope", id: 1 },
                        spans: { rule: "repeated", type: "Span", id: 2 },
                        schemaUrl: { type: "string", id: 3 },
                      },
                    },
                    Span: {
                      fields: {
                        traceId: { type: "bytes", id: 1 },
                        spanId: { type: "bytes", id: 2 },
                        traceState: { type: "string", id: 3 },
                        parentSpanId: { type: "bytes", id: 4 },
                        flags: { type: "fixed32", id: 16 },
                        name: { type: "string", id: 5 },
                        kind: { type: "SpanKind", id: 6 },
                        startTimeUnixNano: { type: "fixed64", id: 7 },
                        endTimeUnixNano: { type: "fixed64", id: 8 },
                        attributes: { rule: "repeated", type: "opentelemetry.proto.common.v1.KeyValue", id: 9 },
                        droppedAttributesCount: { type: "uint32", id: 10 },
                        events: { rule: "repeated", type: "Event", id: 11 },
                        droppedEventsCount: { type: "uint32", id: 12 },
                        links: { rule: "repeated", type: "Link", id: 13 },
                        droppedLinksCount: { type: "uint32", id: 14 },
                        status: { type: "Status", id: 15 },
                      },
                    },
                    SpanKind: {
                      values: {
                        SPAN_KIND_UNSPECIFIED: 0,
                        SPAN_KIND_INTERNAL: 1,
                        SPAN_KIND_SERVER: 2,
                        SPAN_KIND_CLIENT: 3,
                        SPAN_KIND_PRODUCER: 4,
                        SPAN_KIND_CONSUMER: 5,
                      },
                    },
                    Status: {
                      fields: {
                        message: { type: "string", id: 2 },
                        code: { type: "StatusCode", id: 3 },
                      },
                    },
                    StatusCode: {
                      values: {
                        STATUS_CODE_UNSET: 0,
                        STATUS_CODE_OK: 1,
                        STATUS_CODE_ERROR: 2,
                      },
                    },
                    Event: {
                      fields: {
                        timeUnixNano: { type: "fixed64", id: 1 },
                        name: { type: "string", id: 2 },
                        attributes: { rule: "repeated", type: "opentelemetry.proto.common.v1.KeyValue", id: 3 },
                        droppedAttributesCount: { type: "uint32", id: 4 },
                      },
                    },
                    Link: {
                      fields: {
                        traceId: { type: "bytes", id: 1 },
                        spanId: { type: "bytes", id: 2 },
                        traceState: { type: "string", id: 3 },
                        attributes: { rule: "repeated", type: "opentelemetry.proto.common.v1.KeyValue", id: 4 },
                        droppedAttributesCount: { type: "uint32", id: 5 },
                        flags: { type: "fixed32", id: 6 },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

// Lazy-loaded proto root
let protoRoot: protobuf.Root | null = null;
let exportRequestType: protobuf.Type | null = null;

/**
 * Initialize the protobuf root from embedded JSON
 */
function initProto(): protobuf.Type {
  if (exportRequestType) {
    return exportRequestType;
  }

  protoRoot = protobuf.Root.fromJSON(OTLP_PROTO_JSON);
  exportRequestType = protoRoot.lookupType(
    "opentelemetry.proto.collector.trace.v1.ExportTraceServiceRequest"
  );

  logger.debug("OTLP protobuf definitions initialized");
  return exportRequestType;
}

/**
 * Convert bytes to hex string
 */
function bytesToHex(bytes: Uint8Array | Buffer): string {
  return Buffer.from(bytes).toString("hex");
}

/**
 * Convert int64/uint64 (Long) to string
 */
function longToString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return value.toString();
  if (typeof value === "bigint") return value.toString();
  // protobufjs Long type
  if (value && typeof value === "object" && "toString" in value) {
    return (value as { toString(): string }).toString();
  }
  return "0";
}

/**
 * Transform decoded protobuf message to JSON-compatible format
 * Handles bytes → hex and int64 → string conversions
 */
function transformMessage(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(transformMessage);
  }

  if (Buffer.isBuffer(obj) || obj instanceof Uint8Array) {
    return bytesToHex(obj);
  }

  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      // Handle byte fields (traceId, spanId, parentSpanId)
      if (
        (key === "traceId" || key === "spanId" || key === "parentSpanId") &&
        (Buffer.isBuffer(value) || value instanceof Uint8Array)
      ) {
        result[key] = bytesToHex(value);
      }
      // Handle nano timestamps (int64/fixed64)
      else if (
        (key === "startTimeUnixNano" ||
          key === "endTimeUnixNano" ||
          key === "timeUnixNano") &&
        value !== null &&
        value !== undefined
      ) {
        result[key] = longToString(value);
      }
      // Handle intValue in attributes
      else if (key === "intValue" && value !== null && value !== undefined) {
        result[key] = longToString(value);
      }
      // Recurse for nested objects
      else {
        result[key] = transformMessage(value);
      }
    }
    return result;
  }

  return obj;
}

/**
 * Parse OTLP protobuf binary payload
 *
 * @param buffer - The raw protobuf binary data
 * @returns Decoded and transformed OTLP request
 */
export async function parseOtlpProtobuf(buffer: Buffer): Promise<unknown> {
  const messageType = initProto();

  // Decode the protobuf message
  const message = messageType.decode(buffer);

  // Convert to plain object
  const obj = messageType.toObject(message, {
    longs: String, // Convert int64/uint64 to strings
    bytes: Buffer, // Keep bytes as Buffer for manual conversion
    defaults: false, // Don't include default values
    arrays: true, // Always use arrays for repeated fields
  });

  // Transform to JSON-compatible format
  return transformMessage(obj);
}
