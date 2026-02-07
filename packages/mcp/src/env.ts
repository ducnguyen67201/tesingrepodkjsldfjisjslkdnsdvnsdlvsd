import { z } from "zod";

const EnvSchema = z.object({
  DUCSIGR_API_KEY: z.string().min(1, "DUCSIGR_API_KEY is required"),
  DUCSIGR_API_URL: z.string().url("DUCSIGR_API_URL must be a valid URL"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("production"),
});

export type Env = z.infer<typeof EnvSchema>;

export function validateEnv(): Env {
  const result = EnvSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.flatten().fieldErrors;
    const message = Object.entries(errors)
      .map(([field, msgs]) => `  ${field}: ${msgs?.join(", ")}`)
      .join("\n");

    throw new Error(
      `Environment validation failed:\n${message}`
    );
  }

  return result.data;
}
