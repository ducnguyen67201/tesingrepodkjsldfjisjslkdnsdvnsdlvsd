import type { DucsigrConfig, ResolvedConfig } from './types';

const DEFAULT_ENDPOINT = 'https://ingest.ducsigr.com';
const DEFAULT_FLUSH_INTERVAL = 5000;
const DEFAULT_MAX_BATCH_SIZE = 10;
const DEFAULT_MAX_RETRIES = 3;

/**
 * Get environment variable value (works in Node.js and edge runtimes)
 */
function getEnv(key: string): string | undefined {
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key];
  }
  return undefined;
}

/**
 * Resolve configuration with defaults and environment variables
 */
export function resolveConfig(config: DucsigrConfig): ResolvedConfig {
  const apiKey = config.apiKey ?? getEnv('DUCSIGR_API_KEY') ?? '';
  const disabled = config.disabled ?? getEnv('DUCSIGR_DISABLED') === 'true';

  if (!apiKey && !disabled) {
    console.warn(
      '[Ducsigr] No API key provided. Set apiKey in config or DUCSIGR_API_KEY env var.'
    );
  }

  return {
    apiKey,
    endpoint:
      config.endpoint ?? getEnv('DUCSIGR_ENDPOINT') ?? DEFAULT_ENDPOINT,
    debug: config.debug ?? getEnv('DUCSIGR_DEBUG') === 'true',
    disabled,
    flushInterval: config.flushInterval ?? DEFAULT_FLUSH_INTERVAL,
    maxBatchSize: config.maxBatchSize ?? DEFAULT_MAX_BATCH_SIZE,
    maxRetries: config.maxRetries ?? DEFAULT_MAX_RETRIES,
  };
}

/**
 * Validate resolved configuration
 */
export function validateConfig(config: ResolvedConfig): void {
  if (!config.disabled && !config.apiKey) {
    throw new Error('[Ducsigr] API key is required when SDK is enabled');
  }

  if (
    !config.endpoint.startsWith('http://') &&
    !config.endpoint.startsWith('https://')
  ) {
    throw new Error('[Ducsigr] Endpoint must be a valid URL');
  }

  if (config.flushInterval < 100) {
    throw new Error('[Ducsigr] Flush interval must be at least 100ms');
  }

  if (config.maxBatchSize < 1) {
    throw new Error('[Ducsigr] Max batch size must be at least 1');
  }

  if (config.maxRetries < 0) {
    throw new Error('[Ducsigr] Max retries cannot be negative');
  }
}
