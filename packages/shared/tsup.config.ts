import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "cache/index": "src/cache/index.ts",
    "llm/index": "src/llm/index.ts",
    "llm/configs/index": "src/llm/configs/index.ts",
    "rca/index": "src/rca/index.ts",
  },
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  treeshake: true,
  external: ["@anthropic-ai/sdk", "openai", "ioredis"],
});
