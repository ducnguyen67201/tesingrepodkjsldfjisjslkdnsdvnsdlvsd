import { createHash, randomBytes, timingSafeEqual } from "crypto";

/**
 * Configuration for API key generation.
 * Must be set via setApiKeyConfig() before using any API key functions.
 */
export interface ApiKeyConfig {
  prefix: string;
  randomBytesLength: number;
  base62Charset: string;
}

// Global config - must be initialized via setApiKeyConfig()
let globalConfig: ApiKeyConfig | null = null;

/**
 * Ensures config has been initialized.
 * Throws if setApiKeyConfig() hasn't been called.
 */
function requireConfig(): ApiKeyConfig {
  if (!globalConfig) {
    throw new Error(
      "API key config not initialized. Call setApiKeyConfig() first with values from environment variables."
    );
  }
  return globalConfig;
}

/**
 * Set global API key configuration.
 * MUST be called once at app startup with values from environment variables.
 *
 * @example
 * ```ts
 * import { setApiKeyConfig } from "@ducsigr/shared";
 * import { env } from "@/lib/env";
 *
 * setApiKeyConfig({
 *   prefix: env.API_KEY_PREFIX,
 *   randomBytesLength: env.API_KEY_RANDOM_BYTES_LENGTH,
 *   base62Charset: env.API_KEY_BASE62_CHARSET,
 * });
 * ```
 */
export function setApiKeyConfig(config: ApiKeyConfig): void {
  globalConfig = { ...config };
}

/**
 * Get current API key configuration.
 * Throws if config hasn't been initialized.
 */
export function getApiKeyConfig(): ApiKeyConfig {
  return { ...requireConfig() };
}

/**
 * Check if API key config has been initialized.
 */
export function isApiKeyConfigInitialized(): boolean {
  return globalConfig !== null;
}

/**
 * Generates a cryptographically secure API key.
 * Format: {prefix} + random bytes encoded as base62
 *
 * Uses crypto.randomBytes() which uses OS-level CSPRNG
 * (getrandom on Linux, CryptGenRandom on Windows)
 */
export function generateApiKey(config?: Partial<ApiKeyConfig>): string {
  const baseConfig = requireConfig();
  const { prefix, randomBytesLength, base62Charset } = {
    ...baseConfig,
    ...config,
  };

  const randomBuffer = randomBytes(randomBytesLength);
  const encoded = encodeBase62(randomBuffer, base62Charset);
  return `${prefix}${encoded}`;
}

/**
 * Hashes an API key using SHA-256.
 * Returns 64-character hex string.
 *
 * Why SHA-256 (not bcrypt):
 * - API keys have 256 bits of entropy (vs passwords ~40 bits)
 * - Brute-force is computationally infeasible
 * - bcrypt adds 100ms+ latency per validation
 * - Industry standard (Stripe, GitHub, AWS)
 */
export function hashApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex");
}

/**
 * Creates a masked display version of an API key.
 * Shows prefix and last 4 characters only.
 * Example: co_sk_...o5p6
 */
export function maskApiKey(
  apiKey: string,
  config?: Partial<ApiKeyConfig>
): string {
  const baseConfig = requireConfig();
  const { prefix } = { ...baseConfig, ...config };

  if (!apiKey.startsWith(prefix)) {
    throw new Error("Invalid API key format");
  }
  const suffix = apiKey.slice(-4);
  return `${prefix}...${suffix}`;
}

/**
 * Validates API key format without database lookup.
 * Checks prefix and minimum length.
 */
export function isValidApiKeyFormat(
  apiKey: string,
  config?: Partial<ApiKeyConfig>
): boolean {
  const baseConfig = requireConfig();
  const { prefix, randomBytesLength } = { ...baseConfig, ...config };

  return (
    typeof apiKey === "string" &&
    apiKey.startsWith(prefix) &&
    apiKey.length >= prefix.length + randomBytesLength
  );
}

/**
 * Validates hash using constant-time comparison.
 * CRITICAL: Prevents timing attacks.
 */
export function validateHashConstantTime(
  providedHash: string,
  storedHash: string
): boolean {
  if (providedHash.length !== storedHash.length) {
    return false;
  }

  const providedBuffer = Buffer.from(providedHash, "hex");
  const storedBuffer = Buffer.from(storedHash, "hex");

  return timingSafeEqual(providedBuffer, storedBuffer);
}

/**
 * Validates internal secret using constant-time comparison.
 */
export function validateInternalSecret(
  provided: string | null,
  expected: string
): boolean {
  if (!provided || provided.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

/**
 * Encodes bytes to base62 string.
 * Base62 is URL-safe (alphanumeric only).
 */
function encodeBase62(buffer: Buffer, charset: string): string {
  let result = "";

  // Convert buffer to BigInt for base conversion
  let num = BigInt("0x" + buffer.toString("hex"));
  const base = BigInt(charset.length);

  while (num > 0n) {
    result = charset[Number(num % base)] + result;
    num = num / base;
  }

  // Pad to consistent length (43 chars for 32 bytes with base62)
  const expectedLength = Math.ceil((buffer.length * 8) / Math.log2(charset.length));
  return result.padStart(expectedLength, charset[0]);
}

/**
 * Get the current API key prefix from config.
 * Throws if config hasn't been initialized.
 */
export function getApiKeyPrefix(): string {
  return requireConfig().prefix;
}
