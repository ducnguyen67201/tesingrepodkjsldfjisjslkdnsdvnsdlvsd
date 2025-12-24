"use client";

import { useState, useCallback, useMemo } from "react";
import { Loader2, FileJson, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  ExtensionManifestSchema,
  ExtensionVisibilitySchema,
  type ExtensionManifest,
  type ExtensionVisibility,
} from "@cognobserve/api/schemas";

// ============================================================================
// Types
// ============================================================================

interface ImportManifestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  onImport: (manifest: ExtensionManifest, visibility: ExtensionVisibility) => Promise<void>;
  isImporting: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const VISIBILITY_OPTIONS: { value: ExtensionVisibility; label: string; description: string }[] = [
  { value: "PRIVATE", label: "Private", description: "Only visible in this workspace" },
  { value: "UNLISTED", label: "Unlisted", description: "Accessible by direct link" },
  { value: "PUBLIC", label: "Public", description: "Visible to all workspaces" },
];

const SAMPLE_MANIFEST = `{
  "id": "mycompany.theme.custom",
  "name": "Custom Theme",
  "version": "1.0.0",
  "type": "THEME",
  "description": "A custom theme for my workspace",
  "permissions": ["ui:theme"],
  "configSchema": {
    "type": "object",
    "properties": {
      "primaryColor": { "type": "string", "default": "#3b82f6" }
    }
  }
}`;

// ============================================================================
// Component
// ============================================================================

export function ImportManifestDialog({
  open,
  onOpenChange,
  workspaceId,
  onImport,
  isImporting,
}: ImportManifestDialogProps) {
  const [manifestJson, setManifestJson] = useState("");
  const [visibility, setVisibility] = useState<ExtensionVisibility>("PRIVATE");
  const [error, setError] = useState<string | null>(null);

  // Validate manifest JSON
  const validationResult = useMemo(() => {
    if (!manifestJson.trim()) {
      return { valid: false, error: null, manifest: null };
    }

    try {
      const parsed = JSON.parse(manifestJson);
      const result = ExtensionManifestSchema.safeParse(parsed);

      if (!result.success) {
        const firstError = result.error.issues[0];
        return {
          valid: false,
          error: `${firstError?.path.join(".")}: ${firstError?.message}`,
          manifest: null,
        };
      }

      return { valid: true, error: null, manifest: result.data };
    } catch {
      return { valid: false, error: "Invalid JSON syntax", manifest: null };
    }
  }, [manifestJson]);

  // Handlers
  const handleManifestChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setManifestJson(e.target.value);
    setError(null);
  }, []);

  const handleVisibilityChange = useCallback((value: string) => {
    const parsed = ExtensionVisibilitySchema.safeParse(value);
    if (parsed.success) {
      setVisibility(parsed.data);
    }
  }, []);

  const handleLoadSample = useCallback(() => {
    setManifestJson(SAMPLE_MANIFEST);
    setError(null);
  }, []);

  const handleImport = useCallback(async () => {
    if (!validationResult.manifest) {
      setError("Invalid manifest");
      return;
    }

    try {
      await onImport(validationResult.manifest, visibility);
      // Reset form on success
      setManifestJson("");
      setVisibility("PRIVATE");
      setError(null);
    } catch (err) {
      // Error is handled by parent
    }
  }, [validationResult.manifest, visibility, onImport]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        // Reset form when closing
        setManifestJson("");
        setVisibility("PRIVATE");
        setError(null);
      }
      onOpenChange(open);
    },
    [onOpenChange]
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileJson className="h-5 w-5" />
            Import Extension Manifest
          </DialogTitle>
          <DialogDescription>
            Create a new extension by importing a JSON manifest. The extension will be available
            for installation in your workspace.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Visibility selector */}
          <div className="space-y-2">
            <Label htmlFor="visibility">Visibility</Label>
            <Select value={visibility} onValueChange={handleVisibilityChange}>
              <SelectTrigger id="visibility">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VISIBILITY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <div className="flex flex-col">
                      <span>{option.label}</span>
                      <span className="text-xs text-muted-foreground">{option.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Manifest JSON input */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="manifest">Manifest JSON</Label>
              <Button variant="ghost" size="sm" onClick={handleLoadSample}>
                Load sample
              </Button>
            </div>
            <Textarea
              id="manifest"
              placeholder="Paste your extension manifest JSON here..."
              value={manifestJson}
              onChange={handleManifestChange}
              className="min-h-[300px] font-mono text-sm"
            />
          </div>

          {/* Validation feedback */}
          {validationResult.error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{validationResult.error}</AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {validationResult.valid && validationResult.manifest && (
            <Alert>
              <FileJson className="h-4 w-4" />
              <AlertDescription>
                <strong>{validationResult.manifest.name}</strong> v{validationResult.manifest.version}
                <span className="ml-2 text-muted-foreground">
                  ({validationResult.manifest.type})
                </span>
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isImporting}>
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={!validationResult.valid || isImporting}
          >
            {isImporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Import Extension
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
