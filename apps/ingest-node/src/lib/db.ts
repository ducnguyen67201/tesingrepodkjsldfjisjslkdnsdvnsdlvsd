/**
 * Database Client
 *
 * Re-exports Prisma client from @ducsigr/db for use in ingest-node.
 * Uses the shared connection pool across the application.
 */
export { prisma, Prisma } from "@ducsigr/db";
export type { ApiKey, Project } from "@ducsigr/db";
