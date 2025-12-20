import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["src/**/*.{test,spec}.ts"],
    exclude: ["node_modules", "dist"],
    environment: "node",
    // Set environment variables for tests
    env: {
      DATABASE_URL: "postgresql://test:test@localhost:5432/test_db",
      NODE_ENV: "test",
      PORT: "8080",
      HOST: "0.0.0.0",
      LOG_LEVEL: "error",
      RATE_LIMIT_RPS: "10",
      RATE_LIMIT_BURST: "20",
      MAX_PAYLOAD_BYTES: "524288",
      MAX_SPANS_PER_REQUEST: "500",
      MAX_ATTR_PER_SPAN: "64",
      MAX_EVENTS_PER_SPAN: "64",
      MAX_LINKS_PER_SPAN: "32",
      MAX_ATTR_VALUE_LEN: "2048",
      SKIP_ENV_VALIDATION: "true",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/*.spec.ts", "src/index.ts"],
    },
    // Increase timeout for integration tests
    testTimeout: 10000,
    // Run tests sequentially to avoid port conflicts
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
