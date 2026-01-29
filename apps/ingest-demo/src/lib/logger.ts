/**
 * Pino Logger with OTLP Log Transport
 *
 * Creates a pino logger that sends logs to the Ducsigr ingest service
 * in OTLP-compatible format.
 */
import pino from "pino";
import { config } from "../config/env.js";

/**
 * OTLP severity number mapping for pino levels
 * @see https://opentelemetry.io/docs/specs/otel/logs/data-model/#severity-fields
 */
const PINO_TO_OTLP_SEVERITY: Record<string, number> = {
  trace: 1, // TRACE
  debug: 5, // DEBUG
  info: 9, // INFO
  warn: 13, // WARN
  error: 17, // ERROR
  fatal: 21, // FATAL
};

/**
 * Map pino level number to OTLP severity
 */
function levelToSeverity(level: number): { severityNumber: number; severityText: string } {
  if (level <= 10) return { severityNumber: 1, severityText: "TRACE" };
  if (level <= 20) return { severityNumber: 5, severityText: "DEBUG" };
  if (level <= 30) return { severityNumber: 9, severityText: "INFO" };
  if (level <= 40) return { severityNumber: 13, severityText: "WARN" };
  if (level <= 50) return { severityNumber: 17, severityText: "ERROR" };
  return { severityNumber: 21, severityText: "FATAL" };
}

/**
 * OTLP attribute value type
 */
interface OtlpAttributeValue {
  stringValue?: string;
  intValue?: string;
  doubleValue?: number;
  boolValue?: boolean;
}

/**
 * Convert a value to OTLP attribute format
 */
function toOtlpValue(value: unknown): OtlpAttributeValue {
  if (typeof value === "string") {
    return { stringValue: value };
  }
  if (typeof value === "number") {
    if (Number.isInteger(value)) {
      return { intValue: String(value) };
    }
    return { doubleValue: value };
  }
  if (typeof value === "boolean") {
    return { boolValue: value };
  }
  // Fallback: stringify
  return { stringValue: String(value) };
}

/**
 * Convert an object to OTLP attributes array
 */
function toOtlpAttributes(obj: Record<string, unknown>): Array<{ key: string; value: OtlpAttributeValue }> {
  return Object.entries(obj)
    .filter(([key]) => !["level", "time", "pid", "hostname", "msg", "name"].includes(key))
    .map(([key, value]) => ({
      key,
      value: toOtlpValue(value),
    }));
}

/**
 * Log entry interface from pino
 */
interface LogEntry {
  level: number;
  time: number;
  msg: string;
  [key: string]: unknown;
}

/**
 * Log buffer for batching
 */
let logBuffer: LogEntry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

const FLUSH_INTERVAL = 5000; // 5 seconds
const MAX_BATCH_SIZE = 50;

/**
 * Format logs as OTLP ExportLogsServiceRequest
 */
function formatOtlpPayload(logs: LogEntry[]): object {
  const now = Date.now() * 1_000_000; // Current time in nanoseconds

  return {
    resourceLogs: [
      {
        resource: {
          attributes: [
            {
              key: "service.name",
              value: { stringValue: config.otel.serviceName },
            },
            {
              key: "service.version",
              value: { stringValue: "0.1.0" },
            },
          ],
        },
        scopeLogs: [
          {
            scope: {
              name: "pino",
              version: "9.6.0",
            },
            logRecords: logs.map((log) => {
              const { severityNumber, severityText } = levelToSeverity(log.level);
              return {
                timeUnixNano: String(log.time * 1_000_000), // Convert ms to ns
                observedTimeUnixNano: String(now),
                severityNumber,
                severityText,
                body: { stringValue: log.msg || "" },
                attributes: toOtlpAttributes(log),
              };
            }),
          },
        ],
      },
    ],
  };
}

/**
 * Flush logs to the ingest service
 */
async function flushLogs(): Promise<void> {
  if (logBuffer.length === 0) return;

  const logs = logBuffer.splice(0, MAX_BATCH_SIZE);
  const payload = formatOtlpPayload(logs);

  try {
    const response = await fetch(`${config.ducsigr.endpoint}/v1/logs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.ducsigr.apiKey && {
          Authorization: `Bearer ${config.ducsigr.apiKey}`,
        }),
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Logger] Failed to send logs: ${response.status} ${errorText}`);
      // Put failed logs back (limit to prevent memory issues)
      if (logBuffer.length < 500) {
        logBuffer.unshift(...logs);
      }
    }
  } catch (error) {
    console.error("[Logger] Error sending logs:", error);
    // Put failed logs back (limit to prevent memory issues)
    if (logBuffer.length < 500) {
      logBuffer.unshift(...logs);
    }
  }
}

/**
 * Schedule flush if not already scheduled
 */
function scheduleFlush(): void {
  if (flushTimer === null) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flushLogs().catch((err) => {
        console.error("[Logger] Flush error:", err);
      });
    }, FLUSH_INTERVAL);

    // Don't prevent process exit
    if (flushTimer.unref) {
      flushTimer.unref();
    }
  }
}

/**
 * Custom pino destination that buffers and sends to OTLP endpoint
 */
function createOtlpDestination(): pino.DestinationStream {
  return {
    write(data: string): void {
      try {
        const log = JSON.parse(data) as LogEntry;
        logBuffer.push(log);

        // Flush immediately if batch size reached
        if (logBuffer.length >= MAX_BATCH_SIZE) {
          flushLogs().catch((err) => {
            console.error("[Logger] Flush error:", err);
          });
        } else {
          scheduleFlush();
        }
      } catch {
        // If parsing fails, just log to console
        console.error("[Logger] Failed to parse log entry");
      }
    },
  };
}

/**
 * Create the pino logger with multiple destinations
 * - Console output (pino's default formatting)
 * - OTLP transport (batched, async)
 */
function createLogger(): pino.Logger {
  const isDev = config.server.isDev;

  // Create multistream for both console and OTLP
  const streams: pino.StreamEntry[] = [
    // Pretty console output in dev, JSON in prod
    {
      level: "trace",
      stream: isDev
        ? process.stdout
        : process.stdout,
    },
    // OTLP transport
    {
      level: "trace",
      stream: createOtlpDestination(),
    },
  ];

  return pino(
    {
      name: config.otel.serviceName,
      level: isDev ? "debug" : "info",
      // Use default serializers
      serializers: pino.stdSerializers,
      // Add base context
      base: {
        service: config.otel.serviceName,
        version: "0.1.0",
      },
    },
    pino.multistream(streams)
  );
}

/**
 * The shared logger instance
 */
export const logger = createLogger();

/**
 * Flush pending logs (for graceful shutdown)
 */
export async function flushPendingLogs(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  await flushLogs();
}

/**
 * Create a child logger with additional context
 */
export function createChildLogger(bindings: Record<string, unknown>): pino.Logger {
  return logger.child(bindings);
}
