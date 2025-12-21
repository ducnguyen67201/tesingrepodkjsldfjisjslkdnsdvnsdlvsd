import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  /**
   * Server-side environment variables schema.
   */
  server: {
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),

    // Demo app server
    PORT: z.coerce.number().default(3005),

    // CognObserve ingest endpoint
    COGNOBSERVE_ENDPOINT: z.string().url().default("http://localhost:8080"),
    COGNOBSERVE_API_KEY: z.string().optional(),

    // OpenTelemetry service name
    OTEL_SERVICE_NAME: z.string().default("ingest-demo"),
  },

  /**
   * Runtime environment variables.
   */
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
    COGNOBSERVE_ENDPOINT: process.env.COGNOBSERVE_ENDPOINT,
    COGNOBSERVE_API_KEY: process.env.COGNOBSERVE_API_KEY,
    OTEL_SERVICE_NAME: process.env.OTEL_SERVICE_NAME,
  },

  /**
   * Skip validation in certain environments.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,

  /**
   * Treat empty strings as undefined.
   */
  emptyStringAsUndefined: true,
});

/**
 * Derived configuration object for convenience
 */
export const config = {
  server: {
    port: env.PORT,
    isDev: env.NODE_ENV === "development",
    isProd: env.NODE_ENV === "production",
  },
  cognobserve: {
    endpoint: env.COGNOBSERVE_ENDPOINT,
    apiKey: env.COGNOBSERVE_API_KEY,
    tracesUrl: `${env.COGNOBSERVE_ENDPOINT}/v1/traces`,
  },
  otel: {
    serviceName: env.OTEL_SERVICE_NAME,
  },
} as const;
