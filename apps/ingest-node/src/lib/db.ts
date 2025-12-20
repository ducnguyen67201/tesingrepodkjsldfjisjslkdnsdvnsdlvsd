/**
 * Database Client
 *
 * Re-exports Prisma client from @cognobserve/db for use in ingest-node.
 * Uses the shared connection pool across the application.
 */
export { prisma, Prisma } from "@cognobserve/db";
export type { ApiKey, Project } from "@cognobserve/db";
