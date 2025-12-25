/**
 * OTLP Logs Protobuf Parser
 *
 * Handles decoding of OTLP Logs protobuf binary payloads.
 * Uses protobufjs to dynamically parse the binary format.
 *
 * OTLP Logs wire format uses the following message structure:
 * - ExportLogsServiceRequest
 *   - resourceLogs[]
 *     - resource
 *       - attributes[]
 *     - scopeLogs[]
 *       - scope
 *       - logRecords[]
 */
import * as protobuf from "protobufjs";
import { logger } from "./logger.js";

/**
 * OTLP Logs Proto definitions embedded as JSON
 * This avoids needing external .proto files at runtime
 */
const OTLP_LOGS_PROTO_JSON = {
  nested: {
    opentelemetry: {
      nested: {
        proto: {
          nested: {
            collector: {
              nested: {
                logs: {
                  nested: {
                    v1: {
                      nested: {
                        ExportLogsServiceRequest: {
                          fields: {
                            resourceLogs: {
                              rule: "repeated",
                              type: "opentelemetry.proto.logs.v1.ResourceLogs",
                              id: 1,
                            },
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
                        value: {
                          oneof: [
                            "stringValue",
                            "boolValue",
                            "intValue",
                            "doubleValue",
                            "arrayValue",
                            "kvlistValue",
                            "bytesValue",
                          ],
                        },
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
                        attributes: {
                          rule: "repeated",
                          type: "KeyValue",
                          id: 3,
                        },
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
                        attributes: {
                          rule: "repeated",
                          type: "opentelemetry.proto.common.v1.KeyValue",
                          id: 1,
                        },
                        droppedAttributesCount: { type: "uint32", id: 2 },
                      },
                    },
                  },
                },
              },
            },
            logs: {
              nested: {
                v1: {
                  nested: {
                    ResourceLogs: {
                      fields: {
                        resource: {
                          type: "opentelemetry.proto.resource.v1.Resource",
                          id: 1,
                        },
                        scopeLogs: { rule: "repeated", type: "ScopeLogs", id: 2 },
                        schemaUrl: { type: "string", id: 3 },
                      },
                    },
                    ScopeLogs: {
                      fields: {
                        scope: {
                          type: "opentelemetry.proto.common.v1.InstrumentationScope",
                          id: 1,
                        },
                        logRecords: {
                          rule: "repeated",
                          type: "LogRecord",
                          id: 2,
                        },
                        schemaUrl: { type: "string", id: 3 },
                      },
                    },
                    LogRecord: {
                      fields: {
                        timeUnixNano: { type: "fixed64", id: 1 },
                        observedTimeUnixNano: { type: "fixed64", id: 11 },
                        severityNumber: { type: "SeverityNumber", id: 2 },
                        severityText: { type: "string", id: 3 },
                        body: {
                          type: "opentelemetry.proto.common.v1.AnyValue",
                          id: 5,
                        },
                        attributes: {
                          rule: "repeated",
                          type: "opentelemetry.proto.common.v1.KeyValue",
                          id: 6,
                        },
                        droppedAttributesCount: { type: "uint32", id: 7 },
                        flags: { type: "fixed32", id: 8 },
                        traceId: { type: "bytes", id: 9 },
                        spanId: { type: "bytes", id: 10 },
                      },
                    },
                    SeverityNumber: {
                      values: {
                        SEVERITY_NUMBER_UNSPECIFIED: 0,
                        SEVERITY_NUMBER_TRACE: 1,
                        SEVERITY_NUMBER_TRACE2: 2,
                        SEVERITY_NUMBER_TRACE3: 3,
                        SEVERITY_NUMBER_TRACE4: 4,
                        SEVERITY_NUMBER_DEBUG: 5,
                        SEVERITY_NUMBER_DEBUG2: 6,
                        SEVERITY_NUMBER_DEBUG3: 7,
                        SEVERITY_NUMBER_DEBUG4: 8,
                        SEVERITY_NUMBER_INFO: 9,
                        SEVERITY_NUMBER_INFO2: 10,
                        SEVERITY_NUMBER_INFO3: 11,
                        SEVERITY_NUMBER_INFO4: 12,
                        SEVERITY_NUMBER_WARN: 13,
                        SEVERITY_NUMBER_WARN2: 14,
                        SEVERITY_NUMBER_WARN3: 15,
                        SEVERITY_NUMBER_WARN4: 16,
                        SEVERITY_NUMBER_ERROR: 17,
                        SEVERITY_NUMBER_ERROR2: 18,
                        SEVERITY_NUMBER_ERROR3: 19,
                        SEVERITY_NUMBER_ERROR4: 20,
                        SEVERITY_NUMBER_FATAL: 21,
                        SEVERITY_NUMBER_FATAL2: 22,
                        SEVERITY_NUMBER_FATAL3: 23,
                        SEVERITY_NUMBER_FATAL4: 24,
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

  protoRoot = protobuf.Root.fromJSON(OTLP_LOGS_PROTO_JSON);
  exportRequestType = protoRoot.lookupType(
    "opentelemetry.proto.collector.logs.v1.ExportLogsServiceRequest"
  );

  logger.debug("OTLP Logs protobuf definitions initialized");
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
    for (const [key, value] of Object.entries(
      obj as Record<string, unknown>
    )) {
      // Handle byte fields (traceId, spanId)
      if (
        (key === "traceId" || key === "spanId") &&
        (Buffer.isBuffer(value) || value instanceof Uint8Array)
      ) {
        result[key] = bytesToHex(value);
      }
      // Handle nano timestamps (int64/fixed64)
      else if (
        (key === "timeUnixNano" || key === "observedTimeUnixNano") &&
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
 * Parse OTLP Logs protobuf binary payload
 *
 * @param buffer - The raw protobuf binary data
 * @returns Decoded and transformed OTLP logs request
 */
export async function parseOtlpLogsProtobuf(buffer: Buffer): Promise<unknown> {
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
