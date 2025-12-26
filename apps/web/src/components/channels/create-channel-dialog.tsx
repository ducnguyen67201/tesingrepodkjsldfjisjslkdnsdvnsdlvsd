"use client";

import { useCallback, ReactNode, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@/lib/form";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import {
  CHANNEL_PROVIDER_LABELS,
  CHANNEL_PROVIDER_ICONS,
  type ChannelProvider,
} from "@ducsigr/api/schemas";
import { showError } from "@/lib/errors";
import { showSuccess } from "@/lib/success";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

const createChannelSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  provider: z.string().min(1).default("DISCORD"),
  webhookUrl: z.string().url("Invalid URL").optional().or(z.literal("")),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
});

type CreateChannelInput = z.output<typeof createChannelSchema>;

interface CreateChannelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceSlug: string;
  trigger?: ReactNode;
}

export function CreateChannelDialog({
  open,
  onOpenChange,
  workspaceSlug,
  trigger,
}: CreateChannelDialogProps) {
  const utils = trpc.useUtils();

  // Fetch available providers from API (derived from registered adapters)
  const { data: availableProviders, isLoading: isLoadingProviders } =
    trpc.alerts.getProviders.useQuery(undefined, {
      enabled: open,
      staleTime: 60_000, // Cache for 1 minute
    });

  const createChannel = trpc.channels.create.useMutation({
    onSuccess: (channel) => {
      showSuccess("Channel created", `"${channel.name}" is ready to use.`);
      utils.channels.list.invalidate({ workspaceSlug });
      onOpenChange(false);
      form.reset();
    },
    onError: showError,
  });

  // Get first available provider as default
  const defaultProvider = useMemo(() => {
    if (availableProviders && availableProviders.length > 0) {
      return availableProviders[0];
    }
    return "DISCORD";
  }, [availableProviders]);

  const form = useForm<CreateChannelInput>({
    resolver: zodResolver(createChannelSchema),
    defaultValues: {
      name: "",
      provider: defaultProvider,
      webhookUrl: "",
      email: "",
    },
  });

  const selectedProvider = form.watch("provider");

  const handleSubmit = useCallback(
    (data: CreateChannelInput) => {
      let config: Record<string, unknown> = {};

      if (data.provider === "DISCORD") {
        if (!data.webhookUrl) {
          form.setError("webhookUrl", { message: "Webhook URL is required" });
          return;
        }
        config = { webhookUrl: data.webhookUrl };
      } else if (data.provider === "GMAIL") {
        if (!data.email) {
          form.setError("email", { message: "Email is required" });
          return;
        }
        config = { email: data.email };
      }

      createChannel.mutate({
        workspaceSlug,
        name: data.name,
        provider: data.provider as ChannelProvider,
        config,
      });
    },
    [createChannel, form, workspaceSlug]
  );

  const handleDialogChange = useCallback(
    (open: boolean) => {
      if (!open) {
        form.reset();
      }
      onOpenChange(open);
    },
    [form, onOpenChange]
  );

  const renderProviderOption = (provider: string) => {
    const icon = CHANNEL_PROVIDER_ICONS[provider as keyof typeof CHANNEL_PROVIDER_ICONS] ?? "🔔";
    const label = CHANNEL_PROVIDER_LABELS[provider as keyof typeof CHANNEL_PROVIDER_LABELS] ?? provider;
    return (
      <SelectItem key={provider} value={provider}>
        <span className="flex items-center gap-2">
          <span>{icon}</span>
          <span>{label}</span>
        </span>
      </SelectItem>
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add Notification Channel</DialogTitle>
          <DialogDescription>
            Configure a notification channel to receive alert notifications.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Channel Name</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="Engineering Discord"
                      disabled={createChannel.isPending}
                    />
                  </FormControl>
                  <FormDescription>
                    A friendly name to identify this channel.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="provider"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Provider</FormLabel>
                  {isLoadingProviders ? (
                    <Skeleton className="h-10 w-full" />
                  ) : (
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      disabled={createChannel.isPending || !availableProviders?.length}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a provider" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {availableProviders?.map(renderProviderOption)}
                      </SelectContent>
                    </Select>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            {selectedProvider === "DISCORD" && (
              <FormField
                control={form.control}
                name="webhookUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Webhook URL</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="https://discord.com/api/webhooks/..."
                        disabled={createChannel.isPending}
                      />
                    </FormControl>
                    <FormDescription>
                      The Discord webhook URL for your channel.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {selectedProvider === "GMAIL" && (
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email Address</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="email"
                        placeholder="alerts@example.com"
                        disabled={createChannel.isPending}
                      />
                    </FormControl>
                    <FormDescription>
                      The email address to send notifications to.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleDialogChange(false)}
                disabled={createChannel.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createChannel.isPending}>
                {createChannel.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Create Channel
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
