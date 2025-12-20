import { prisma, Prisma } from "@cognobserve/db";
import { TRPCError } from "@trpc/server";

// TODO: OTLP-first migration
// User tracking will be reworked in the new ingest-node service.
// User info should be extracted from OTLP resource attributes (enduser.id, etc.)
// See: docs/specs/ingest/README.md

interface ListUsersInput {
  projectId: string;
  workspaceId: string;
  search?: string;
  from?: Date;
  to?: Date;
  sortBy: "lastSeenAt" | "firstSeenAt";
  sortOrder: "asc" | "desc";
  limit: number;
  cursor?: string;
}

export interface TrackedUserBasic {
  id: string;
  projectId: string;
  externalId: string;
  name: string | null;
  email: string | null;
  metadata: Record<string, unknown> | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
}

/**
 * TrackedUser Service - Basic CRUD operations for tracked users
 * Note: Metrics aggregation removed - will be reworked for OTLP-first design
 */
export class TrackedUserService {
  /**
   * List tracked users (basic info only, no metrics)
   */
  static async list(input: ListUsersInput): Promise<{
    items: TrackedUserBasic[];
    nextCursor: string | undefined;
  }> {
    const { projectId, workspaceId, search, from, to, sortBy, sortOrder, limit, cursor } = input;

    // Verify project belongs to workspace
    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true },
    });

    if (!project) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
    }

    // Build where clause for users
    const where: Prisma.TrackedUserWhereInput = {
      projectId,
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { email: { contains: search, mode: "insensitive" as const } },
          { externalId: { contains: search, mode: "insensitive" as const } },
        ],
      }),
      ...(from && { lastSeenAt: { gte: from } }),
      ...(to && { lastSeenAt: { lte: to } }),
    };

    const users = await prisma.trackedUser.findMany({
      where,
      take: limit + 1,
      cursor: cursor ? { id: cursor } : undefined,
      orderBy: { [sortBy]: sortOrder },
      select: {
        id: true,
        projectId: true,
        externalId: true,
        name: true,
        email: true,
        metadata: true,
        firstSeenAt: true,
        lastSeenAt: true,
      },
    });

    const hasMore = users.length > limit;
    const items = users.slice(0, limit).map((user) => ({
      ...user,
      metadata: user.metadata as Record<string, unknown> | null,
    }));

    return {
      items,
      nextCursor: hasMore ? users[limit]?.id : undefined,
    };
  }

  /**
   * Get single user with sessions
   */
  static async get(id: string, workspaceId: string) {
    const user = await prisma.trackedUser.findUnique({
      where: { id },
      include: {
        project: { select: { workspaceId: true } },
        sessions: {
          take: 10,
          orderBy: { updatedAt: "desc" },
        },
        _count: { select: { sessions: true } },
      },
    });

    if (!user || user.project.workspaceId !== workspaceId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
    }

    return user;
  }

  /**
   * Get user by external ID
   */
  static async getByExternalId(
    projectId: string,
    externalId: string,
    workspaceId: string
  ) {
    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true },
    });

    if (!project) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
    }

    const user = await prisma.trackedUser.findUnique({
      where: { projectId_externalId: { projectId, externalId } },
    });

    if (!user) {
      throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
    }

    return user;
  }

  /**
   * Project-level user summary stats
   */
  static async getSummary(projectId: string, workspaceId: string) {
    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true },
    });

    if (!project) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
    }

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [totalUsers, activeUsers, newUsers] = await Promise.all([
      prisma.trackedUser.count({ where: { projectId } }),
      prisma.trackedUser.count({
        where: { projectId, lastSeenAt: { gte: sevenDaysAgo } },
      }),
      prisma.trackedUser.count({
        where: { projectId, firstSeenAt: { gte: sevenDaysAgo } },
      }),
    ]);

    return {
      totalUsers,
      activeUsers,
      newUsers,
    };
  }

  /**
   * Update user metadata
   */
  static async update(
    id: string,
    workspaceId: string,
    data: { name?: string; email?: string; metadata?: Record<string, unknown> }
  ) {
    const user = await prisma.trackedUser.findUnique({
      where: { id },
      select: { metadata: true, project: { select: { workspaceId: true } } },
    });

    if (!user || user.project.workspaceId !== workspaceId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
    }

    const existingMetadata =
      user.metadata && typeof user.metadata === "object" && !Array.isArray(user.metadata)
        ? (user.metadata as Record<string, unknown>)
        : {};
    const mergedMetadata = data.metadata
      ? { ...existingMetadata, ...data.metadata }
      : undefined;

    return prisma.trackedUser.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.email !== undefined && { email: data.email }),
        ...(mergedMetadata !== undefined && {
          metadata: mergedMetadata as Prisma.InputJsonValue,
        }),
      },
    });
  }

  /**
   * Delete tracked user
   */
  static async delete(id: string, workspaceId: string) {
    try {
      await prisma.trackedUser.delete({
        where: {
          id,
          project: { workspaceId },
        },
      });
      return { success: true };
    } catch (e) {
      if ((e as { code?: string }).code === "P2025") {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }
      throw e;
    }
  }
}
