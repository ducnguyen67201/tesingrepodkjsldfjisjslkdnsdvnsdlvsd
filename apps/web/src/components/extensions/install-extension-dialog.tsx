"use client";

import { useState, useCallback, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PermissionApproval } from "./permission-approval";
import { useExtension } from "@/hooks/use-extensions";
import {
  type ExtensionPermission,
  ExtensionManifestSchema,
  EXTENSION_TYPE_LABELS,
} from "@cognobserve/api/schemas";

// ============================================================================
// Types
// ============================================================================

interface InstallExtensionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  extensionId: string | null;
  workspaceId: string;
  onInstall: (params: {
    extensionId: string;
    approvedPermissions: ExtensionPermission[];
  }) => Promise<void>;
  isInstalling: boolean;
}

// ============================================================================
// Component
// ============================================================================

export function InstallExtensionDialog({
  open,
  onOpenChange,
  extensionId,
  workspaceId,
  onInstall,
  isInstalling,
}: InstallExtensionDialogProps) {
  const [approvedPermissions, setApprovedPermissions] = useState<ExtensionPermission[]>([]);
  const { extension, isLoading } = useExtension(extensionId ?? "", workspaceId);

  // Parse manifest to get permissions
  const manifest = extension?.versions?.[0]?.manifest;
  const parsedManifest = manifest
    ? ExtensionManifestSchema.safeParse(manifest)
    : null;
  const permissions = parsedManifest?.success
    ? parsedManifest.data.permissions
    : [];

  // Reset approved permissions when extension changes
  useEffect(() => {
    setApprovedPermissions([]);
  }, [extensionId]);

  const handleApprovalChange = useCallback(
    (permission: ExtensionPermission, approved: boolean) => {
      setApprovedPermissions((prev) =>
        approved ? [...prev, permission] : prev.filter((p) => p !== permission)
      );
    },
    []
  );

  const handleApproveAll = useCallback(() => {
    setApprovedPermissions(permissions);
  }, [permissions]);

  const handleInstall = useCallback(async () => {
    if (!extensionId) return;
    await onInstall({
      extensionId,
      approvedPermissions,
    });
  }, [extensionId, approvedPermissions, onInstall]);

  const allPermissionsApproved = permissions.every((p) =>
    approvedPermissions.includes(p)
  );

  const handleClose = useCallback(() => {
    if (!isInstalling) {
      onOpenChange(false);
    }
  }, [isInstalling, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {isLoading ? "Loading..." : `Install ${extension?.name ?? "Extension"}`}
          </DialogTitle>
          <DialogDescription>
            {extension?.type && (
              <span className="text-xs font-medium text-muted-foreground">
                {EXTENSION_TYPE_LABELS[extension.type as keyof typeof EXTENSION_TYPE_LABELS]}
              </span>
            )}
            {extension?.description && (
              <span className="block mt-1">{extension.description}</span>
            )}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="py-4">
            <PermissionApproval
              permissions={permissions}
              approvedPermissions={approvedPermissions}
              onApprovalChange={handleApprovalChange}
              disabled={isInstalling}
            />
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {permissions.length > 0 && !allPermissionsApproved && (
            <Button
              variant="outline"
              onClick={handleApproveAll}
              disabled={isInstalling}
            >
              Approve all
            </Button>
          )}
          <Button variant="outline" onClick={handleClose} disabled={isInstalling}>
            Cancel
          </Button>
          <Button
            onClick={handleInstall}
            disabled={!allPermissionsApproved || isInstalling || isLoading}
          >
            {isInstalling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isInstalling ? "Installing..." : "Install"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
