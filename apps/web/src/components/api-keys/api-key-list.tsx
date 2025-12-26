"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiKeys } from "@/hooks/use-api-keys";
import { ApiKeyTable } from "./api-key-table";
import { ApiKeyEmptyState } from "./api-key-empty-state";
import { CreateApiKeyDialog } from "./create-api-key-dialog";
import { ApiKeyCreatedDialog } from "./api-key-created-dialog";
import { DeleteApiKeyDialog } from "./delete-api-key-dialog";
import type { ApiKeyListItem, CreatedApiKey } from "@ducsigr/api/client";
import { toast } from "sonner";

interface ApiKeyListProps {
  workspaceSlug: string;
  projectId: string;
}

export function ApiKeyList({ workspaceSlug, projectId }: ApiKeyListProps) {
  const { apiKeys, isLoading, error, createApiKey, deleteApiKey } = useApiKeys(
    workspaceSlug,
    projectId
  );

  // Dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createdKey, setCreatedKey] = useState<CreatedApiKey | null>(null);
  const [keyToDelete, setKeyToDelete] = useState<ApiKeyListItem | null>(null);

  const handleCreateSuccess = (key: CreatedApiKey) => {
    setCreatedKey(key);
    toast.success("API key created successfully");
  };

  const handleCreatedDialogClose = () => {
    setCreatedKey(null);
  };

  const handleDeleteClick = (key: ApiKeyListItem) => {
    setKeyToDelete(key);
  };

  const handleDeleteConfirm = async () => {
    if (!keyToDelete) return;
    await deleteApiKey(keyToDelete.id);
    setKeyToDelete(null);
    toast.success("API key deleted");
  };

  const handleCreateClick = () => {
    setCreateDialogOpen(true);
  };

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>API Keys</CardTitle>
          <CardDescription>
            Manage API keys for authenticating trace ingestion
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md bg-destructive/15 p-4 text-center text-destructive">
            Failed to load API keys. Please try again.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div className="space-y-1">
            <CardTitle>API Keys</CardTitle>
            <CardDescription>
              Manage API keys for authenticating trace ingestion
            </CardDescription>
          </div>
          {!isLoading && apiKeys.length > 0 && (
            <Button onClick={handleCreateClick}>
              <Plus className="mr-2 h-4 w-4" />
              Create API Key
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : apiKeys.length === 0 ? (
            <ApiKeyEmptyState onCreateClick={handleCreateClick} />
          ) : (
            <ApiKeyTable apiKeys={apiKeys} onDelete={handleDeleteClick} />
          )}
        </CardContent>
      </Card>

      <CreateApiKeyDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={handleCreateSuccess}
        onCreateKey={createApiKey}
      />

      <ApiKeyCreatedDialog
        open={!!createdKey}
        onClose={handleCreatedDialogClose}
        apiKey={createdKey}
      />

      <DeleteApiKeyDialog
        open={!!keyToDelete}
        onOpenChange={(open) => !open && setKeyToDelete(null)}
        onConfirm={handleDeleteConfirm}
        apiKey={keyToDelete}
      />
    </>
  );
}
