/**
 * Client-safe schemas export.
 * This file only exports Zod schemas and derived constants,
 * with NO server-side dependencies (Prisma, tRPC routers, etc.)
 *
 * Use this import in client components:
 * import { WORKSPACE_ADMIN_ROLES } from "@ducsigr/api/schemas";
 */
export * from "./schemas/index";
