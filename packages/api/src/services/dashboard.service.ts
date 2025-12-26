/**
 * Dashboard Service
 *
 * Business logic for dashboard and widget operations.
 */

import { prisma, type Prisma } from "@ducsigr/db";
import { TRPCError } from "@trpc/server";
import type {
  CreateDashboardInput,
  UpdateDashboardInput,
  ListDashboardsInput,
  UpsertWidgetInput,
  UpdateLayoutInput,
} from "../schemas/dashboard";

/**
 * DashboardService - Static class for dashboard operations
 */
export class DashboardService {
  /**
   * List dashboards for a workspace, optionally filtered by project
   */
  static async list(
    input: ListDashboardsInput,
    workspaceId: string,
    userId: string
  ) {
    const where: Prisma.DashboardWhereInput = {
      workspaceId,
      // If projectId specified, filter to that project; otherwise show workspace-level
      projectId: input.projectId ?? null,
      // Filter by visibility if specified
      ...(input.visibility && { visibility: input.visibility }),
      // Only show personal dashboards if created by current user
      OR: [
        { visibility: "workspace" },
        { visibility: "personal", createdById: userId },
      ],
    };

    return prisma.dashboard.findMany({
      where,
      include: {
        widgets: {
          select: { id: true, title: true, type: true },
        },
        createdBy: {
          select: { id: true, name: true, email: true, image: true },
        },
        project: {
          select: { id: true, name: true },
        },
      },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
  }

  /**
   * Get a single dashboard by ID with all widgets
   */
  static async getById(dashboardId: string, workspaceId: string, userId: string) {
    const dashboard = await prisma.dashboard.findUnique({
      where: { id: dashboardId },
      include: {
        widgets: {
          include: {
            createdBy: {
              select: { id: true, name: true, email: true },
            },
          },
          orderBy: { createdAt: "asc" },
        },
        createdBy: {
          select: { id: true, name: true, email: true, image: true },
        },
        project: {
          select: { id: true, name: true },
        },
      },
    });

    if (!dashboard) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Dashboard not found" });
    }

    // Verify workspace access
    if (dashboard.workspaceId !== workspaceId) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }

    // Verify personal dashboard access
    if (dashboard.visibility === "personal" && dashboard.createdById !== userId) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }

    return dashboard;
  }

  /**
   * Create a new dashboard
   */
  static async create(
    input: CreateDashboardInput,
    workspaceId: string,
    userId: string
  ) {
    // If projectId provided, verify it belongs to this workspace
    if (input.projectId) {
      const project = await prisma.project.findFirst({
        where: { id: input.projectId, workspaceId },
        select: { id: true },
      });

      if (!project) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      }
    }

    // If setting as default, unset other defaults for this scope
    if (input.isDefault) {
      await prisma.dashboard.updateMany({
        where: {
          workspaceId,
          projectId: input.projectId ?? null,
          isDefault: true,
        },
        data: { isDefault: false },
      });
    }

    return prisma.dashboard.create({
      data: {
        workspaceId,
        projectId: input.projectId,
        name: input.name,
        description: input.description,
        visibility: input.visibility,
        isDefault: input.isDefault,
        createdById: userId,
      },
      include: {
        widgets: true,
        createdBy: {
          select: { id: true, name: true, email: true, image: true },
        },
      },
    });
  }

  /**
   * Update dashboard metadata
   */
  static async update(
    input: UpdateDashboardInput,
    workspaceId: string,
    userId: string
  ) {
    // Verify dashboard exists and user has access
    const dashboard = await this.getById(input.id, workspaceId, userId);

    // Check if user can modify (creator or admin)
    if (dashboard.visibility === "personal" && dashboard.createdById !== userId) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Cannot modify another user's personal dashboard",
      });
    }

    // If setting as default, unset other defaults
    if (input.isDefault) {
      await prisma.dashboard.updateMany({
        where: {
          workspaceId,
          projectId: dashboard.projectId,
          isDefault: true,
          id: { not: input.id },
        },
        data: { isDefault: false },
      });
    }

    const { id, workspaceSlug: _workspaceSlug, ...updateData } = input;

    return prisma.dashboard.update({
      where: { id },
      data: updateData,
      include: {
        widgets: true,
        createdBy: {
          select: { id: true, name: true, email: true, image: true },
        },
      },
    });
  }

  /**
   * Delete a dashboard and all its widgets
   */
  static async delete(dashboardId: string, workspaceId: string, userId: string) {
    // Verify access
    const dashboard = await this.getById(dashboardId, workspaceId, userId);

    // Check if user can delete
    if (dashboard.visibility === "personal" && dashboard.createdById !== userId) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Cannot delete another user's personal dashboard",
      });
    }

    await prisma.dashboard.delete({ where: { id: dashboardId } });
    return { success: true };
  }

  /**
   * Upsert a widget (create or update)
   */
  static async upsertWidget(
    input: UpsertWidgetInput,
    workspaceId: string,
    userId: string
  ) {
    // Verify dashboard access
    const dashboard = await this.getById(input.dashboardId, workspaceId, userId);

    // Extract fields for widget
    const widgetData = {
      title: input.title,
      type: input.type,
      query: input.query as Prisma.InputJsonValue,
      display: input.display as Prisma.InputJsonValue,
      layout: input.layout as Prisma.InputJsonValue,
    };

    if (input.widgetId) {
      // Update existing widget
      const widget = await prisma.dashboardWidget.findUnique({
        where: { id: input.widgetId },
        select: { dashboardId: true },
      });

      if (!widget || widget.dashboardId !== dashboard.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Widget not found" });
      }

      return prisma.dashboardWidget.update({
        where: { id: input.widgetId },
        data: widgetData,
      });
    } else {
      // Create new widget
      return prisma.dashboardWidget.create({
        data: {
          ...widgetData,
          dashboardId: dashboard.id,
          createdById: userId,
        },
      });
    }
  }

  /**
   * Delete a widget
   */
  static async deleteWidget(
    dashboardId: string,
    widgetId: string,
    workspaceId: string,
    userId: string
  ) {
    // Verify dashboard access
    await this.getById(dashboardId, workspaceId, userId);

    const widget = await prisma.dashboardWidget.findUnique({
      where: { id: widgetId },
      select: { dashboardId: true },
    });

    if (!widget || widget.dashboardId !== dashboardId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Widget not found" });
    }

    await prisma.dashboardWidget.delete({ where: { id: widgetId } });
    return { success: true };
  }

  /**
   * Batch update widget layouts
   */
  static async updateLayout(
    input: UpdateLayoutInput,
    workspaceId: string,
    userId: string
  ) {
    // Verify dashboard access
    await this.getById(input.dashboardId, workspaceId, userId);

    // Update all layouts in a transaction
    await prisma.$transaction(
      input.layouts.map((item) =>
        prisma.dashboardWidget.update({
          where: { id: item.widgetId },
          data: { layout: item.layout as Prisma.InputJsonValue },
        })
      )
    );

    return { success: true };
  }

  /**
   * Get default dashboard for a project or workspace
   */
  static async getDefault(
    workspaceId: string,
    projectId: string | null,
    userId: string
  ) {
    // First try to find explicit default
    let dashboard = await prisma.dashboard.findFirst({
      where: {
        workspaceId,
        projectId,
        isDefault: true,
        OR: [
          { visibility: "workspace" },
          { visibility: "personal", createdById: userId },
        ],
      },
      include: {
        widgets: true,
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    // If no default, get the first workspace-visible dashboard
    if (!dashboard) {
      dashboard = await prisma.dashboard.findFirst({
        where: {
          workspaceId,
          projectId,
          visibility: "workspace",
        },
        include: {
          widgets: true,
          createdBy: {
            select: { id: true, name: true, email: true },
          },
        },
        orderBy: { createdAt: "asc" },
      });
    }

    return dashboard;
  }
}
