"use client";

import { useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { Loader2, Plus, Bell } from "lucide-react";
import { WORKSPACE_ADMIN_ROLES } from "@ducsigr/api/schemas";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ChannelsList } from "@/components/channels/channels-list";
import { CreateChannelDialog } from "@/components/channels/create-channel-dialog";

export default function WorkspaceSettingsChannelsPage() {
  const params = useParams<{ workspaceSlug: string }>();
  const [dialogOpen, setDialogOpen] = useState(false);

  // Get workspace details
  const { data: workspace } = trpc.workspaces.getBySlug.useQuery(
    { workspaceSlug: params.workspaceSlug },
    { enabled: !!params.workspaceSlug }
  );

  const isAdmin = workspace
    ? (WORKSPACE_ADMIN_ROLES as readonly string[]).includes(workspace.role)
    : false;

  const {
    data: channels,
    isLoading,
    error,
  } = trpc.channels.list.useQuery(
    { workspaceSlug: params.workspaceSlug },
    { enabled: !!params.workspaceSlug }
  );

  const handleDialogChange = useCallback((open: boolean) => {
    setDialogOpen(open);
  }, []);

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Notification Channels
          </h1>
          <p className="text-sm text-muted-foreground">
            You don&apos;t have permission to manage notification channels.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Notification Channels
          </h1>
          <p className="text-sm text-muted-foreground">
            Configure where to send alert notifications.
          </p>
        </div>

        <CreateChannelDialog
          open={dialogOpen}
          onOpenChange={handleDialogChange}
          workspaceSlug={params.workspaceSlug}
          trigger={
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Channel
            </Button>
          }
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Configured Channels</CardTitle>
          <CardDescription>
            Channels that can be linked to alerts to receive notifications.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <p className="text-sm text-destructive">
              Failed to load channels: {error.message}
            </p>
          ) : channels && channels.length > 0 ? (
            <ChannelsList
              channels={channels}
              workspaceSlug={params.workspaceSlug}
            />
          ) : (
            <div className="text-center py-8">
              <Bell className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-sm text-muted-foreground">
                No notification channels configured yet.
              </p>
              <p className="text-sm text-muted-foreground">
                Add a channel to start receiving alert notifications.
              </p>
              <Button
                className="mt-4"
                variant="outline"
                onClick={() => setDialogOpen(true)}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Your First Channel
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
