/**
 * SDK Build-time Environment Configuration
 *
 * These values are baked into the SDK at build/publish time.
 * Set via environment variables when running `pnpm build`:
 *
 * DUCSIGR_DEFAULT_ENDPOINT=https://your-ingest.railway.app pnpm --filter @ducsigr/sdk build
 */

/**
 * Default ingest endpoint - set via DUCSIGR_DEFAULT_ENDPOINT at build time
 * Falls back to 'https://ingest.ducsigr.com' if not set
 */
export const DEFAULT_ENDPOINT =
  process.env.DUCSIGR_DEFAULT_ENDPOINT || 'https://ingest.ducsigr.com';
