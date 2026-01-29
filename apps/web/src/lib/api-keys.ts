/**
 * API key utilities.
 * Re-exported from @ducsigr/shared with environment configuration.
 */
import { env } from "./env";
import {
  setApiKeyConfig,
  generateApiKey as _generateApiKey,
  hashApiKey,
  maskApiKey as _maskApiKey,
  isValidApiKeyFormat as _isValidApiKeyFormat,
  validateHashConstantTime,
  validateInternalSecret,
  getApiKeyPrefix,
  getApiKeyConfig,
  isApiKeyConfigInitialized,
  type ApiKeyConfig,
} from "@ducsigr/shared";

// Initialize API key config from environment variables
setApiKeyConfig({
  prefix: env.API_KEY_PREFIX,
  randomBytesLength: env.API_KEY_RANDOM_BYTES_LENGTH,
  base62Charset: env.API_KEY_BASE62_CHARSET,
});

// Re-export configured functions
export const generateApiKey = () => _generateApiKey();
export const maskApiKey = (apiKey: string) => _maskApiKey(apiKey);
export const isValidApiKeyFormat = (apiKey: string) => _isValidApiKeyFormat(apiKey);

// Re-export unchanged functions
export {
  hashApiKey,
  validateHashConstantTime,
  validateInternalSecret,
  getApiKeyPrefix,
  getApiKeyConfig,
  isApiKeyConfigInitialized,
  type ApiKeyConfig,
};

// Export prefix from env (for convenience)
export const API_KEY_PREFIX = env.API_KEY_PREFIX;
