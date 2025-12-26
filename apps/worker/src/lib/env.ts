// Environment variables are injected by Doppler at runtime.
// Run commands with: doppler run -- <command>
// See: docs/specs/issue-104-doppler-secret-management.md

import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  /**
   * Server-side environment variables schema.
   * These are only available on the server.
   */
  server: {
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),

    // Database
    DATABASE_URL: z.string().url("DATABASE_URL must be a valid URL"),

    // Internal API (for tRPC caller)
    INTERNAL_API_SECRET: z.string().min(32),

    // SMTP Configuration (for Gmail adapter)
    SMTP_HOST: z.string().default("smtp.gmail.com"),
    SMTP_PORT: z.coerce.number().default(587),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    SMTP_FROM: z.string().email().optional(),

    // Temporal Configuration (required)
    TEMPORAL_ADDRESS: z.string().default("localhost:7233"),
    TEMPORAL_NAMESPACE: z.string().default("default"),
    TEMPORAL_TASK_QUEUE: z.string().default("ducsigr-tasks"),

    // GitHub API (optional, for higher rate limits)
    GITHUB_TOKEN: z.string().optional(),

    // GitHub App Configuration (for repository indexing)
    // Required for fetching repository contents via installation token
    GITHUB_APP_ID: z.string().optional(),
    GITHUB_APP_PRIVATE_KEY: z.string().optional(),

    // OpenAI API (for embedding generation)
    // Optional: Worker can start without it, but embedding generation will fail
    OPENAI_API_KEY: z.string().optional(),

    // Redis (for embedding cache)
    // Optional: Falls back to localhost:6379 if not set
    REDIS_URL: z.string().url().optional(),
  },

  /**
   * Runtime environment variables.
   * Map environment variables to the schema.
   */
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    INTERNAL_API_SECRET: process.env.INTERNAL_API_SECRET,
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,
    SMTP_FROM: process.env.SMTP_FROM,

    // Temporal Configuration
    TEMPORAL_ADDRESS: process.env.TEMPORAL_ADDRESS,
    TEMPORAL_NAMESPACE: process.env.TEMPORAL_NAMESPACE,
    TEMPORAL_TASK_QUEUE: process.env.TEMPORAL_TASK_QUEUE,

    // GitHub API
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,

    // GitHub App Configuration
    GITHUB_APP_ID: process.env.GITHUB_APP_ID,
    GITHUB_APP_PRIVATE_KEY: process.env.GITHUB_APP_PRIVATE_KEY,

    // OpenAI API
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,

    // Redis
    REDIS_URL: process.env.REDIS_URL,
  },

  /**
   * Skip validation in certain environments.
   * Useful for Docker builds where env vars aren't available.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,

  /**
   * Treat empty strings as undefined.
   * Useful for optional env vars that might be set to "".
   */
  emptyStringAsUndefined: true,
});
