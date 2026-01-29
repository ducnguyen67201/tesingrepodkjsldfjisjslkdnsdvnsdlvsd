/**
 * Notification Channels Schemas
 *
 * Zod schemas for workspace-level notification channels.
 */

import { z } from "zod";
import { ChannelProviderSchema } from "./alerting";

/**
 * Channel name validation
 */
export const ChannelNameSchema = z
  .string()
  .min(1, "Name is required")
  .max(100, "Name must be at most 100 characters")
  .trim();

/**
 * Schema for creating a notification channel
 */
export const CreateChannelSchema = z.object({
  workspaceSlug: z.string().min(1),
  name: ChannelNameSchema,
  provider: ChannelProviderSchema,
  config: z.record(z.string(), z.unknown()),
});

export type CreateChannelInput = z.infer<typeof CreateChannelSchema>;

/**
 * Schema for updating a notification channel
 */
export const UpdateChannelSchema = z.object({
  workspaceSlug: z.string().min(1),
  id: z.string().min(1),
  name: ChannelNameSchema.optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

export type UpdateChannelInput = z.infer<typeof UpdateChannelSchema>;

/**
 * Schema for listing channels
 */
export const ListChannelsSchema = z.object({
  workspaceSlug: z.string().min(1),
});

export type ListChannelsInput = z.infer<typeof ListChannelsSchema>;

/**
 * Schema for getting a single channel
 */
export const GetChannelSchema = z.object({
  workspaceSlug: z.string().min(1),
  id: z.string().min(1),
});

export type GetChannelInput = z.infer<typeof GetChannelSchema>;

/**
 * Schema for deleting a channel
 */
export const DeleteChannelSchema = z.object({
  workspaceSlug: z.string().min(1),
  id: z.string().min(1),
});

export type DeleteChannelInput = z.infer<typeof DeleteChannelSchema>;

/**
 * Schema for testing a channel
 */
export const TestChannelSchema = z.object({
  workspaceSlug: z.string().min(1),
  id: z.string().min(1),
});

export type TestChannelInput = z.infer<typeof TestChannelSchema>;

/**
 * Schema for linking channel to alert
 */
export const LinkChannelSchema = z.object({
  workspaceSlug: z.string().min(1),
  alertId: z.string().min(1),
  channelId: z.string().min(1),
});

export type LinkChannelInput = z.infer<typeof LinkChannelSchema>;

/**
 * Schema for unlinking channel from alert
 */
export const UnlinkChannelSchema = z.object({
  workspaceSlug: z.string().min(1),
  alertId: z.string().min(1),
  channelId: z.string().min(1),
});

export type UnlinkChannelInput = z.infer<typeof UnlinkChannelSchema>;

/**
 * Schema for getting channels linked to an alert
 */
export const GetLinkedChannelsSchema = z.object({
  workspaceSlug: z.string().min(1),
  alertId: z.string().min(1),
});

export type GetLinkedChannelsInput = z.infer<typeof GetLinkedChannelsSchema>;

/**
 * Provider labels for display
 */
export const CHANNEL_PROVIDER_LABELS: Record<
  z.infer<typeof ChannelProviderSchema>,
  string
> = {
  GMAIL: "Email",
  DISCORD: "Discord",
  SLACK: "Slack",
  PAGERDUTY: "PagerDuty",
  WEBHOOK: "Webhook",
};

/**
 * Provider icons (using emoji for simplicity)
 */
export const CHANNEL_PROVIDER_ICONS: Record<
  z.infer<typeof ChannelProviderSchema>,
  string
> = {
  GMAIL: "📧",
  DISCORD: "🔔",
  SLACK: "💬",
  PAGERDUTY: "🚨",
  WEBHOOK: "🔗",
};
