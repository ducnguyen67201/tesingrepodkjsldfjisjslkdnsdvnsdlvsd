import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'integrations/index': 'src/integrations/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  splitting: false,
  sourcemap: true,
  minify: false,
  treeshake: true,
  external: ['openai', '@anthropic-ai/sdk'],
  // Replace env vars at build time
  env: {
    DUCSIGR_DEFAULT_ENDPOINT:
      process.env.DUCSIGR_DEFAULT_ENDPOINT || 'https://ingest.ducsigr.com',
  },
});
