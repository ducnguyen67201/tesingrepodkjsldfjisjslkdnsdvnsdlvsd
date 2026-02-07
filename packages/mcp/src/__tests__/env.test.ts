import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { validateEnv } from "../env.js";

describe("validateEnv", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("validates with all required env vars", () => {
    process.env.DUCSIGR_API_KEY = "co_sk_test123";
    process.env.DUCSIGR_API_URL = "http://localhost:3000";

    const env = validateEnv();

    expect(env.DUCSIGR_API_KEY).toBe("co_sk_test123");
    expect(env.DUCSIGR_API_URL).toBe("http://localhost:3000");
  });

  it("applies defaults for optional vars", () => {
    process.env.DUCSIGR_API_KEY = "co_sk_test123";
    process.env.DUCSIGR_API_URL = "http://localhost:3000";

    const env = validateEnv();

    // vitest sets NODE_ENV=test, so default won't be "production" in test
    expect(env.NODE_ENV).toBe("test");
  });

  it("throws when DUCSIGR_API_KEY is missing", () => {
    process.env.DUCSIGR_API_URL = "http://localhost:3000";
    delete process.env.DUCSIGR_API_KEY;

    expect(() => validateEnv()).toThrow("DUCSIGR_API_KEY");
  });

  it("throws when DUCSIGR_API_URL is missing", () => {
    process.env.DUCSIGR_API_KEY = "co_sk_test123";
    delete process.env.DUCSIGR_API_URL;

    expect(() => validateEnv()).toThrow("DUCSIGR_API_URL");
  });

  it("throws when DUCSIGR_API_URL is not a valid URL", () => {
    process.env.DUCSIGR_API_KEY = "co_sk_test123";
    process.env.DUCSIGR_API_URL = "not-a-url";

    expect(() => validateEnv()).toThrow("DUCSIGR_API_URL");
  });

  it("accepts https URLs", () => {
    process.env.DUCSIGR_API_KEY = "co_sk_test123";
    process.env.DUCSIGR_API_URL = "https://app.ducsigr.com";

    const env = validateEnv();
    expect(env.DUCSIGR_API_URL).toBe("https://app.ducsigr.com");
  });
});
