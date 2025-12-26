/**
 * Notification Channels Router
 *
 * tRPC router for workspace-level notification channel management.
 */

import { TRPCError } from "@trpc/server";
import { prisma } from "@ducsigr/db";
import { createRouter, protectedProcedure, workspaceMiddleware } from "../trpc";
import {
  CreateChannelSchema,
  UpdateChannelSchema,
  ListChannelsSchema,
  GetChannelSchema,
  DeleteChannelSchema,
  TestChannelSchema,
} from "../schemas/channels";
import { AlertingAdapter } from "../lib/alerting";

/**
 * Notification Channels Router
 */
export const channelsRouter = createRouter({
  /**
   * List all notification channels in a workspace
   */
  list: protectedProcedure
    .input(ListChannelsSchema)
    .use(workspaceMiddleware)
    .query(async ({ ctx }) => {
      const channels = await prisma.notificationChannel.findMany({
        where: { workspaceId: ctx.workspace.id },
        include: {
          _count: { select: { alertLinks: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      return channels.map((channel) => ({
        ...channel,
        alertCount: channel._count.alertLinks,
      }));
    }),

  /**
   * Get a single notification channel
   */
  get: protectedProcedure
    .input(GetChannelSchema)
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }) => {
      const channel = await prisma.notificationChannel.findUnique({
        where: { id: input.id },
        include: {
          alertLinks: {
            include: {
              alert: {
                select: { id: true, name: true, type: true, enabled: true },
              },
            },
          },
        },
      });

      if (!channel) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Channel not found" });
      }

      if (channel.workspaceId !== ctx.workspace.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      return channel;
    }),

  /**
   * Create a new notification channel
   */
  create: protectedProcedure
    .input(CreateChannelSchema)
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      // Validate config with adapter first (before any DB operations)
      let validatedConfig: object;
      try {
        const adapter = AlertingAdapter(input.provider);
        validatedConfig = adapter.validateConfig(input.config) as object;
      } catch (error) {
        if (error instanceof Error && error.message.includes("No adapter registered")) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Provider ${input.provider} is not available`,
          });
        }
        throw error;
      }

      // Atomic create - catch unique constraint violation
      try {
        return await prisma.notificationChannel.create({
          data: {
            workspaceId: ctx.workspace.id,
            name: input.name,
            provider: input.provider,
            config: validatedConfig,
          },
        });
      } catch (error) {
        // Prisma unique constraint violation
        if (
          error instanceof Error &&
          "code" in error &&
          (error as { code: string }).code === "P2002"
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "A channel with this name already exists",
          });
        }
        throw error;
      }
    }),

  /**
   * Update a notification channel
   */
  update: protectedProcedure
    .input(UpdateChannelSchema)
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      // Atomic update with workspace check in where clause
      try {
        // First get current channel to validate config
        const channel = await prisma.notificationChannel.findFirst({
          where: { id: input.id, workspaceId: ctx.workspace.id },
        });

        if (!channel) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Channel not found" });
        }

        // Validate new config if provided
        let validatedConfig: object = channel.config as object;
        if (input.config) {
          try {
            const adapter = AlertingAdapter(channel.provider);
            validatedConfig = adapter.validateConfig(input.config) as object;
          } catch (error) {
            if (error instanceof Error) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: error.message,
              });
            }
            throw error;
          }
        }

        // Reset verified status if config changed
        const verified = input.config ? false : channel.verified;

        // Atomic update with workspace check
        return await prisma.notificationChannel.update({
          where: { id: input.id, workspaceId: ctx.workspace.id },
          data: {
            name: input.name ?? channel.name,
            config: validatedConfig,
            verified,
          },
        });
      } catch (error) {
        // Handle unique constraint violation for name
        if (
          error instanceof Error &&
          "code" in error &&
          (error as { code: string }).code === "P2002"
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "A channel with this name already exists",
          });
        }
        throw error;
      }
    }),

  /**
   * Delete a notification channel
   */
  delete: protectedProcedure
    .input(DeleteChannelSchema)
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      // Get alert count before delete for response
      const channel = await prisma.notificationChannel.findFirst({
        where: { id: input.id, workspaceId: ctx.workspace.id },
        select: { _count: { select: { alertLinks: true } } },
      });

      if (!channel) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Channel not found" });
      }

      // Atomic delete with workspace check in where clause
      try {
        await prisma.notificationChannel.delete({
          where: { id: input.id, workspaceId: ctx.workspace.id },
        });
        return { success: true, unlinkedAlerts: channel._count.alertLinks };
      } catch (error) {
        // Handle record not found (deleted between check and delete)
        if (
          error instanceof Error &&
          "code" in error &&
          (error as { code: string }).code === "P2025"
        ) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Channel not found" });
        }
        throw error;
      }
    }),

  /**
   * Test a notification channel
   */
  test: protectedProcedure
    .input(TestChannelSchema)
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      // Atomic find with workspace check
      const channel = await prisma.notificationChannel.findFirst({
        where: { id: input.id, workspaceId: ctx.workspace.id },
      });

      if (!channel) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Channel not found" });
      }

      try {
        const adapter = AlertingAdapter(channel.provider);
        const result = await adapter.sendTest(channel.config);

        // Mark as verified if successful - atomic update with workspace check
        if (result.success) {
          await prisma.notificationChannel.update({
            where: { id: input.id, workspaceId: ctx.workspace.id },
            data: { verified: true },
          });
        }

        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return {
          success: false,
          provider: channel.provider,
          error: message,
        };
      }
    }),
});

export type ChannelsRouter = typeof channelsRouter;
