/**
 * OpenTelemetry SDK Setup
 *
 * IMPORTANT: This file MUST be imported before any other modules
 * to ensure proper auto-instrumentation of HTTP, Express, and fetch calls.
 */
import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { Resource } from "@opentelemetry/resources";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";

// Read environment variables directly (before env.ts is loaded)
const DUCSIGR_ENDPOINT =
  process.env.DUCSIGR_ENDPOINT || "http://localhost:8080";
const DUCSIGR_API_KEY = process.env.DUCSIGR_API_KEY;
const OTEL_SERVICE_NAME = process.env.OTEL_SERVICE_NAME || "ingest-demo";

// Configure OTLP HTTP exporter to send traces to Ducsigr ingest service
const traceExporter = new OTLPTraceExporter({
  url: `${DUCSIGR_ENDPOINT}/v1/traces`,
  headers: DUCSIGR_API_KEY
    ? {
        "x-api-key": DUCSIGR_API_KEY,
      }
    : undefined,
});

// Create resource with service metadata
const resource = new Resource({
  [ATTR_SERVICE_NAME]: OTEL_SERVICE_NAME,
  [ATTR_SERVICE_VERSION]: "0.1.0",
});

// Initialize the OpenTelemetry SDK
const sdk = new NodeSDK({
  resource,
  traceExporter,
  instrumentations: [
    getNodeAutoInstrumentations({
      // Disable fs instrumentation to reduce noise
      "@opentelemetry/instrumentation-fs": {
        enabled: false,
      },
      // Configure HTTP instrumentation
      "@opentelemetry/instrumentation-http": {
        enabled: true,
      },
      // Configure Express instrumentation
      "@opentelemetry/instrumentation-express": {
        enabled: true,
      },
      // Configure fetch instrumentation for external API calls
      "@opentelemetry/instrumentation-undici": {
        enabled: true,
      },
    }),
  ],
});

// Start the SDK
sdk.start();

// Log initialization
console.log(
  `[telemetry] OpenTelemetry initialized for service: ${OTEL_SERVICE_NAME}`
);
console.log(`[telemetry] Exporting traces to: ${DUCSIGR_ENDPOINT}/v1/traces`);

// Graceful shutdown
const shutdown = async () => {
  console.log("[telemetry] Shutting down OpenTelemetry SDK...");
  try {
    await sdk.shutdown();
    console.log("[telemetry] SDK shutdown complete");
  } catch (error) {
    console.error("[telemetry] Error during SDK shutdown:", error);
  }
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

export { sdk };
