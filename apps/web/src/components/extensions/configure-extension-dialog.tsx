"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useExtension } from "@/hooks/use-extensions";
import { EXTENSION_TYPE_LABELS } from "@ducsigr/api/schemas";

// ============================================================================
// Types
// ============================================================================

interface ConfigureExtensionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  extensionId: string | null;
  installId: string | null;
  workspaceId: string;
  onConfigure: (params: {
    installId: string;
    config: Record<string, unknown>;
  }) => Promise<void>;
  isConfiguring: boolean;
}

// ============================================================================
// Component
// ============================================================================

export function ConfigureExtensionDialog({
  open,
  onOpenChange,
  extensionId,
  installId,
  workspaceId,
  onConfigure,
  isConfiguring,
}: ConfigureExtensionDialogProps) {
  const [configJson, setConfigJson] = useState("{}");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const { extension, isLoading } = useExtension(extensionId ?? "", workspaceId);

  // Get current config from install (memoized to prevent infinite re-renders)
  const currentConfig = useMemo(() => {
    const currentInstall = extension?.installs?.[0];
    return currentInstall?.configJson ?? {};
  }, [extension?.installs]);

  // Reset config when extension changes
  useEffect(() => {
    if (currentConfig && Object.keys(currentConfig).length > 0) {
      setConfigJson(JSON.stringify(currentConfig, null, 2));
    } else {
      setConfigJson("{}");
    }
    setJsonError(null);
  }, [extensionId, currentConfig]);

  const handleConfigChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      setConfigJson(value);

      // Validate JSON
      try {
        JSON.parse(value);
        setJsonError(null);
      } catch {
        setJsonError("Invalid JSON format");
      }
    },
    []
  );

  const handleSave = useCallback(async () => {
    if (!installId || jsonError) return;

    try {
      const config = JSON.parse(configJson);
      await onConfigure({ installId, config });
      onOpenChange(false);
    } catch {
      setJsonError("Invalid JSON format");
    }
  }, [installId, configJson, jsonError, onConfigure, onOpenChange]);

  const handleClose = useCallback(() => {
    if (!isConfiguring) {
      onOpenChange(false);
    }
  }, [isConfiguring, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {isLoading ? "Loading..." : `Configure ${extension?.name ?? "Extension"}`}
          </DialogTitle>
          <DialogDescription>
            {extension?.type && (
              <span className="text-xs font-medium text-muted-foreground">
                {EXTENSION_TYPE_LABELS[extension.type as keyof typeof EXTENSION_TYPE_LABELS]}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="config">Configuration (JSON)</Label>
              <Textarea
                id="config"
                value={configJson}
                onChange={handleConfigChange}
                rows={10}
                className="font-mono text-sm"
                placeholder="{}"
                disabled={isConfiguring}
              />
              {jsonError && (
                <p className="text-sm text-destructive">{jsonError}</p>
              )}
            </div>

            {extension?.versions?.[0]?.manifest &&
              typeof extension.versions[0].manifest === "object" &&
              "configSchema" in extension.versions[0].manifest && (
                <div className="rounded-md bg-muted p-3">
                  <p className="text-xs text-muted-foreground">
                    This extension supports configuration. Refer to the
                    extension documentation for available options.
                  </p>
                </div>
              )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isConfiguring}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isConfiguring || isLoading || !!jsonError}
          >
            {isConfiguring && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isConfiguring ? "Saving..." : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
