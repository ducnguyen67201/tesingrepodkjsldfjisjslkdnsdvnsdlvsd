import { z } from "zod";

/**
 * Environment configuration schema with validation
 */
const EnvSchema = z.object({
  // Server
  PORT: z.coerce.number().default(8081),
  HOST: z.string().default("0.0.0.0"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // Database
  DATABASE_URL: z.string(),

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
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

export type Env = z.infer<typeof EnvSchema>;

/**
 * Parse and validate environment variables
 */
function parseEnv(): Env {
  const result = EnvSchema.safeParse(process.env);

  if (!result.success) {
    console.error("Invalid environment configuration:");
    for (const issue of result.error.issues) {
      console.error(`  ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }

  return result.data;
}

/**
 * Validated environment configuration
 */
export const env = parseEnv();

/**
 * Configuration object derived from environment
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
