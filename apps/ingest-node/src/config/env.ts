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

    // Server
    PORT: z.coerce.number().default(8081),
    HOST: z.string().default("0.0.0.0"),

    // Database
    DATABASE_URL: z.string().url("DATABASE_URL must be a valid URL"),

    // Limits
    MAX_PAYLOAD_BYTES: z.coerce.number().default(512 * 1024), // 512KB
    MAX_SPANS_PER_REQUEST: z.coerce.number().default(500),
    MAX_ATTR_PER_SPAN: z.coerce.number().default(64),
    MAX_EVENTS_PER_SPAN: z.coerce.number().default(64),
    MAX_LINKS_PER_SPAN: z.coerce.number().default(32),
    MAX_ATTR_VALUE_LEN: z.coerce.number().default(2048),

    // Rate limiting
    RATE_LIMIT_RPS: z.coerce.number().default(200),
    RATE_LIMIT_BURST: z.coerce.number().default(400),

    // Logging
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace"])
      .default("info"),
  },

  /**
   * Runtime environment variables.
   */
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
    HOST: process.env.HOST,
    DATABASE_URL: process.env.DATABASE_URL,
    MAX_PAYLOAD_BYTES: process.env.MAX_PAYLOAD_BYTES,
    MAX_SPANS_PER_REQUEST: process.env.MAX_SPANS_PER_REQUEST,
    MAX_ATTR_PER_SPAN: process.env.MAX_ATTR_PER_SPAN,
    MAX_EVENTS_PER_SPAN: process.env.MAX_EVENTS_PER_SPAN,
    MAX_LINKS_PER_SPAN: process.env.MAX_LINKS_PER_SPAN,
    MAX_ATTR_VALUE_LEN: process.env.MAX_ATTR_VALUE_LEN,
    RATE_LIMIT_RPS: process.env.RATE_LIMIT_RPS,
    RATE_LIMIT_BURST: process.env.RATE_LIMIT_BURST,
    LOG_LEVEL: process.env.LOG_LEVEL,
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
    host: env.HOST,
    isDev: env.NODE_ENV === "development",
    isProd: env.NODE_ENV === "production",
  },
  limits: {
    maxPayloadBytes: env.MAX_PAYLOAD_BYTES,
    maxSpansPerRequest: env.MAX_SPANS_PER_REQUEST,
    maxAttrPerSpan: env.MAX_ATTR_PER_SPAN,
    maxEventsPerSpan: env.MAX_EVENTS_PER_SPAN,
    maxLinksPerSpan: env.MAX_LINKS_PER_SPAN,
    maxAttrValueLen: env.MAX_ATTR_VALUE_LEN,
  },
  rateLimit: {
    rps: env.RATE_LIMIT_RPS,
    burst: env.RATE_LIMIT_BURST,
  },
  logging: {
    level: env.LOG_LEVEL,
  },
} as const;
