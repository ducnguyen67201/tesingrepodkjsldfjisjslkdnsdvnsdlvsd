"use client";

import { useCallback } from "react";
import {
  MoreHorizontal,
  Trash2,
  Send,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";
import type { ChannelProvider } from "@ducsigr/db";
import {
  CHANNEL_PROVIDER_LABELS,
  CHANNEL_PROVIDER_ICONS,
} from "@ducsigr/api/schemas";
import { showError } from "@/lib/errors";
import { showSuccess, showDeleted } from "@/lib/success";
import { trpc } from "@/lib/trpc/client";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Channel {
  id: string;
  name: string;
  provider: ChannelProvider;
  verified: boolean;
  createdAt: Date;
  alertCount: number;
}

interface ChannelsListProps {
  channels: Channel[];
  workspaceSlug: string;
}

export function ChannelsList({ channels, workspaceSlug }: ChannelsListProps) {
  const utils = trpc.useUtils();
  const { confirm } = useConfirm();

  const testChannel = trpc.channels.test.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        showSuccess("Test sent", "Check your notification channel for the test message.");
        utils.channels.list.invalidate({ workspaceSlug });
      } else {
        showError(new Error(result.error ?? "Test failed"));
      }
    },
    onError: showError,
  });

  const deleteChannel = trpc.channels.delete.useMutation({
    onSuccess: () => {
      showDeleted("Channel");
      utils.channels.list.invalidate({ workspaceSlug });
    },
    onError: showError,
  });

  const handleTest = useCallback(
    (channelId: string) => {
      testChannel.mutate({ workspaceSlug, id: channelId });
    },
    [testChannel, workspaceSlug]
  );

  const handleDelete = useCallback(
    async (channel: Channel) => {
      const confirmed = await confirm({
        title: "Delete channel",
        message:
          channel.alertCount > 0
            ? `This channel is linked to ${channel.alertCount} alert${channel.alertCount === 1 ? "" : "s"}. Deleting it will remove those links.`
            : `Are you sure you want to delete "${channel.name}"?`,
        confirmText: "Delete",
        variant: "destructive",
      });

      if (confirmed) {
        deleteChannel.mutate({ workspaceSlug, id: channel.id });
      }
    },
    [confirm, deleteChannel, workspaceSlug]
  );

  const renderChannelRow = (channel: Channel) => {
    const icon = CHANNEL_PROVIDER_ICONS[channel.provider] ?? "🔔";
    const label = CHANNEL_PROVIDER_LABELS[channel.provider] ?? channel.provider;
    const isTestPending =
      testChannel.isPending && testChannel.variables?.id === channel.id;
    const isDeletePending =
      deleteChannel.isPending && deleteChannel.variables?.id === channel.id;

    return (
      <TableRow key={channel.id}>
        <TableCell>
          <div className="flex items-center gap-3">
            <span className="text-xl">{icon}</span>
            <div>
              <p className="font-medium">{channel.name}</p>
              <p className="text-xs text-muted-foreground">
                Used by {channel.alertCount} alert{channel.alertCount !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
        </TableCell>
        <TableCell>
          <Badge variant="secondary">{label}</Badge>
        </TableCell>
        <TableCell>
          {channel.verified ? (
            <Badge variant="outline" className="text-green-600 border-green-600">
              <CheckCircle2 className="mr-1 h-3 w-3" />
              Verified
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              <XCircle className="mr-1 h-3 w-3" />
              Not verified
            </Badge>
          )}
        </TableCell>
        <TableCell>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                disabled={isTestPending || isDeletePending}
              >
                {isTestPending || isDeletePending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <MoreHorizontal className="h-4 w-4" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleTest(channel.id)}>
                <Send className="mr-2 h-4 w-4" />
                Send Test
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => handleDelete(channel)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      </TableRow>
    );
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Channel</TableHead>
          <TableHead>Provider</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="w-[50px]"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>{channels.map(renderChannelRow)}</TableBody>
    </Table>
  );
}
