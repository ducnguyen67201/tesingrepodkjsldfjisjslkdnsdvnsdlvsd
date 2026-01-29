import { describe, it, expect, beforeEach } from "vitest";
import {
  generateApiKey,
  hashApiKey,
  maskApiKey,
  isValidApiKeyFormat,
  validateHashConstantTime,
  validateInternalSecret,
  setApiKeyConfig,
  getApiKeyConfig,
  getApiKeyPrefix,
  isApiKeyConfigInitialized,
} from "../api-keys";

// Test config values (injected from env in production)
const TEST_CONFIG = {
  prefix: "co_sk_",
  randomBytesLength: 32,
  base62Charset: "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
};

// Initialize config before each test
beforeEach(() => {
  setApiKeyConfig(TEST_CONFIG);
});

describe("API Key Utilities", () => {
  describe("setApiKeyConfig / getApiKeyConfig", () => {
    it("should initialize config", () => {
      expect(isApiKeyConfigInitialized()).toBe(true);
      const config = getApiKeyConfig();
      expect(config.prefix).toBe("co_sk_");
      expect(config.randomBytesLength).toBe(32);
    });

    it("should update config values", () => {
      setApiKeyConfig({ ...TEST_CONFIG, prefix: "custom_" });
      const config = getApiKeyConfig();
      expect(config.prefix).toBe("custom_");
    });
  });

  describe("generateApiKey", () => {
    it("should generate a key with correct prefix", () => {
      const key = generateApiKey();
      expect(key.startsWith("co_sk_")).toBe(true);
    });

    it("should generate a key with correct length", () => {
      const key = generateApiKey();
      // co_sk_ (6 chars) + 43 chars base62 = 49 chars total
      expect(key.length).toBe(49);
    });

    it("should generate unique keys", () => {
      const keys = new Set<string>();
      for (let i = 0; i < 100; i++) {
        keys.add(generateApiKey());
      }
      expect(keys.size).toBe(100);
    });

    it("should only contain alphanumeric characters after prefix", () => {
      const key = generateApiKey();
      const keyBody = key.slice(6); // Skip "co_sk_"
      expect(/^[0-9A-Za-z]+$/.test(keyBody)).toBe(true);
    });

    it("should respect custom config override", () => {
      const key = generateApiKey({ prefix: "test_" });
      expect(key.startsWith("test_")).toBe(true);
    });
  });

  describe("hashApiKey", () => {
    it("should return a 64-character hex string", () => {
      const key = generateApiKey();
      const hash = hashApiKey(key);
      expect(hash.length).toBe(64);
      expect(/^[0-9a-f]+$/.test(hash)).toBe(true);
    });

    it("should produce consistent hashes for same input", () => {
      const key = generateApiKey();
      const hash1 = hashApiKey(key);
      const hash2 = hashApiKey(key);
      expect(hash1).toBe(hash2);
    });

    it("should produce different hashes for different keys", () => {
      const key1 = generateApiKey();
      const key2 = generateApiKey();
      const hash1 = hashApiKey(key1);
      const hash2 = hashApiKey(key2);
      expect(hash1).not.toBe(hash2);
    });
  });

  describe("maskApiKey", () => {
    it("should mask a valid key correctly", () => {
      const key = "co_sk_abcdefghijklmnopqrstuvwxyz1234567890ABCD";
      const masked = maskApiKey(key);
      expect(masked).toBe("co_sk_...ABCD");
    });

    it("should show only last 4 characters", () => {
      const key = generateApiKey();
      const masked = maskApiKey(key);
      const lastFour = key.slice(-4);
      expect(masked).toBe(`co_sk_...${lastFour}`);
    });

    it("should throw for invalid prefix", () => {
      expect(() => maskApiKey("invalid_key")).toThrow("Invalid API key format");
    });

    it("should respect custom config prefix override", () => {
      const key = "test_abcdefghijklmnopqrstuvwxyz1234567890ABCD";
      const masked = maskApiKey(key, { prefix: "test_" });
      expect(masked).toBe("test_...ABCD");
    });
  });

  describe("isValidApiKeyFormat", () => {
    it("should return true for valid keys", () => {
      const key = generateApiKey();
      expect(isValidApiKeyFormat(key)).toBe(true);
    });

    it("should return false for keys without prefix", () => {
      expect(isValidApiKeyFormat("invalid_key_1234567890123456789012345678901234")).toBe(false);
    });

    it("should return false for keys that are too short", () => {
      expect(isValidApiKeyFormat("co_sk_short")).toBe(false);
    });

    it("should return false for non-string inputs", () => {
      expect(isValidApiKeyFormat(null as unknown as string)).toBe(false);
      expect(isValidApiKeyFormat(undefined as unknown as string)).toBe(false);
      expect(isValidApiKeyFormat(123 as unknown as string)).toBe(false);
    });

    it("should return true for minimum valid length", () => {
      // Prefix (6) + 32 chars minimum
      const minKey = `co_sk_${"a".repeat(32)}`;
      expect(isValidApiKeyFormat(minKey)).toBe(true);
    });

    it("should respect custom config override", () => {
      const key = `test_${"a".repeat(32)}`;
      expect(isValidApiKeyFormat(key, { prefix: "test_" })).toBe(true);
    });
  });

  describe("validateHashConstantTime", () => {
    it("should return true for matching hashes", () => {
      const key = generateApiKey();
      const hash = hashApiKey(key);
      expect(validateHashConstantTime(hash, hash)).toBe(true);
    });

    it("should return false for different hashes", () => {
      const key1 = generateApiKey();
      const key2 = generateApiKey();
      const hash1 = hashApiKey(key1);
      const hash2 = hashApiKey(key2);
      expect(validateHashConstantTime(hash1, hash2)).toBe(false);
    });

    it("should return false for different length hashes", () => {
      const hash1 = "abcd1234";
      const hash2 = "abcd12345";
      expect(validateHashConstantTime(hash1, hash2)).toBe(false);
    });
  });

  describe("validateInternalSecret", () => {
    it("should return true for matching secrets", () => {
      const secret = "my-super-secret-internal-key-1234";
      expect(validateInternalSecret(secret, secret)).toBe(true);
    });

    it("should return false for different secrets", () => {
      const secret1 = "my-super-secret-internal-key-1234";
      const secret2 = "my-super-secret-internal-key-5678";
      expect(validateInternalSecret(secret1, secret2)).toBe(false);
    });

    it("should return false for null provided", () => {
      expect(validateInternalSecret(null, "expected")).toBe(false);
    });

    it("should return false for different length secrets", () => {
      expect(validateInternalSecret("short", "longerexpected")).toBe(false);
    });
  });

  describe("getApiKeyPrefix", () => {
    it("should return current prefix from config", () => {
      setApiKeyConfig({ ...TEST_CONFIG, prefix: "myapp_" });
      expect(getApiKeyPrefix()).toBe("myapp_");
    });
  });
});
