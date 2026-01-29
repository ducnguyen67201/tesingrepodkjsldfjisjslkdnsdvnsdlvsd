import type { DucsigrConfig, ResolvedConfig } from './types';
import { DEFAULT_ENDPOINT } from './env';
const DEFAULT_FLUSH_INTERVAL = 5000;
const DEFAULT_MAX_BATCH_SIZE = 10;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_MAX_QUEUE_SIZE = 10000;
const DEFAULT_TIMEOUT = 30000;
const DEFAULT_COMPRESSION = true;
const DEFAULT_MAX_RETRY_DELAY = 30000;
const DEFAULT_SAMPLE_RATE = 1.0;

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
    maxQueueSize: config.maxQueueSize ?? DEFAULT_MAX_QUEUE_SIZE,
    timeout: config.timeout ?? DEFAULT_TIMEOUT,
    compression: config.compression ?? DEFAULT_COMPRESSION,
    maxRetryDelay: config.maxRetryDelay ?? DEFAULT_MAX_RETRY_DELAY,
    sampleRate: Math.max(0, Math.min(1, config.sampleRate ?? DEFAULT_SAMPLE_RATE)),
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

  if (config.maxQueueSize < 1) {
    throw new Error('[Ducsigr] Max queue size must be at least 1');
  }

  if (config.timeout < 1000) {
    throw new Error('[Ducsigr] Timeout must be at least 1000ms');
  }

  if (config.maxRetryDelay < 1000) {
    throw new Error('[Ducsigr] Max retry delay must be at least 1000ms');
  }

  if (config.sampleRate < 0 || config.sampleRate > 1) {
    throw new Error('[Ducsigr] Sample rate must be between 0.0 and 1.0');
  }
}
