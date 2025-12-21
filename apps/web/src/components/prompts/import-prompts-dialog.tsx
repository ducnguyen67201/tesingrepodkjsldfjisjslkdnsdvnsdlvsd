"use client";

import { useState, useCallback } from "react";
import { Loader2, Upload, FileJson, AlertCircle, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { trpc } from "@/lib/trpc/client";
import { showError } from "@/lib/errors";
import { showSuccess } from "@/lib/success";

interface ImportPromptsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceSlug: string;
  projectId: string;
}

type ChatRole = "system" | "user" | "assistant" | "tool";

interface ImportPrompt {
  name: string;
  slug?: string;
  description?: string;
  tags?: string[];
  template: { type: "text"; text: string } | { type: "chat"; messages: Array<{ role: ChatRole; content: string; name?: string }> };
  variables?: Array<{ name: string; required?: boolean; default?: string; description?: string }>;
  config?: Record<string, unknown>;
}

interface ParseResult {
  prompts: ImportPrompt[];
  errors: string[];
}

export function ImportPromptsDialog({
  open,
  onOpenChange,
  workspaceSlug,
  projectId,
}: ImportPromptsDialogProps) {
  const utils = trpc.useUtils();

  const [file, setFile] = useState<File | null>(null);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  const [createVersions, setCreateVersions] = useState(true);

  const importMutation = trpc.prompts.import.useMutation({
    onSuccess: (result) => {
      const total = result.created.length + result.updated.length;
      showSuccess(
        "Import complete",
        `${result.created.length} created, ${result.updated.length} updated, ${result.skipped.length} skipped`
      );
      utils.prompts.list.invalidate({ workspaceSlug, projectId });
      handleClose();
    },
    onError: showError,
  });

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = e.target.files?.[0];
      if (!selectedFile) return;

      setFile(selectedFile);
      setParseResult(null);

      try {
        const text = await selectedFile.text();
        const parsed = parseImportFile(text, selectedFile.name);
        setParseResult(parsed);
      } catch (err) {
        setParseResult({
          prompts: [],
          errors: [err instanceof Error ? err.message : "Failed to parse file"],
        });
      }
    },
    []
  );

  const handleImport = useCallback(async () => {
    if (!parseResult || parseResult.prompts.length === 0) return;

    await importMutation.mutateAsync({
      workspaceSlug,
      projectId,
      format: "json",
      prompts: parseResult.prompts,
      options: {
        overwrite,
        createVersions,
      },
    });
  }, [parseResult, importMutation, workspaceSlug, projectId, overwrite, createVersions]);

  const handleClose = useCallback(() => {
    setFile(null);
    setParseResult(null);
    setOverwrite(false);
    setCreateVersions(true);
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import Prompts</DialogTitle>
          <DialogDescription>
            Import prompts from a JSON file. Supports CognObserve export format.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* File Upload */}
          <div className="space-y-2">
            <Label>Select File</Label>
            <div className="flex items-center gap-2">
              <label className="flex-1">
                <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed p-6 cursor-pointer hover:bg-muted/50 transition-colors">
                  <Upload className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    {file ? file.name : "Click to select JSON file"}
                  </span>
                </div>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Parse Errors */}
          {parseResult?.errors.length ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {parseResult.errors.map((err, i) => (
                  <div key={i}>{err}</div>
                ))}
              </AlertDescription>
            </Alert>
          ) : null}

          {/* Preview */}
          {parseResult && parseResult.prompts.length > 0 && (
            <div className="space-y-3">
              <Label>Preview ({parseResult.prompts.length} prompts)</Label>
              <ScrollArea className="h-40 rounded-md border">
                <div className="p-3 space-y-2">
                  {parseResult.prompts.map((prompt, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 text-sm p-2 rounded bg-muted/50"
                    >
                      <FileJson className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{prompt.name}</p>
                        <p className="text-xs text-muted-foreground font-mono truncate">
                          {prompt.slug || generateSlug(prompt.name)}
                        </p>
                      </div>
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        {prompt.template.type}
                      </Badge>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Options */}
          {parseResult && parseResult.prompts.length > 0 && (
            <div className="space-y-3 pt-2 border-t">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="create-versions">Create new versions</Label>
                  <p className="text-xs text-muted-foreground">
                    Add as new version if prompt exists
                  </p>
                </div>
                <Switch
                  id="create-versions"
                  checked={createVersions}
                  onCheckedChange={setCreateVersions}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="overwrite">Overwrite existing</Label>
                  <p className="text-xs text-muted-foreground">
                    Replace existing prompt metadata
                  </p>
                </div>
                <Switch
                  id="overwrite"
                  checked={overwrite}
                  onCheckedChange={setOverwrite}
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={
              importMutation.isPending ||
              !parseResult ||
              parseResult.prompts.length === 0
            }
          >
            {importMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Import {parseResult?.prompts.length || 0} Prompts
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Parse import file (JSON format)
 */
function parseImportFile(content: string, filename: string): ParseResult {
  const errors: string[] = [];
  const prompts: ImportPrompt[] = [];

  try {
    const data = JSON.parse(content);

    // Handle array format
    const promptsArray = Array.isArray(data) ? data : data.prompts;

    if (!Array.isArray(promptsArray)) {
      return {
        prompts: [],
        errors: ["Invalid format: expected array of prompts or { prompts: [...] }"],
      };
    }

    for (let i = 0; i < promptsArray.length; i++) {
      const item = promptsArray[i];

      // Validate required fields
      if (!item.name || typeof item.name !== "string") {
        errors.push(`Prompt ${i + 1}: missing or invalid 'name'`);
        continue;
      }

      if (!item.template) {
        errors.push(`Prompt ${i + 1} (${item.name}): missing 'template'`);
        continue;
      }

      // Handle different template formats
      let template: ImportPrompt["template"];
      const validRoles: ChatRole[] = ["system", "user", "assistant", "tool"];

      if (item.template.type === "text" && typeof item.template.text === "string") {
        template = { type: "text", text: item.template.text };
      } else if (item.template.type === "chat" && Array.isArray(item.template.messages)) {
        // Validate and filter messages with valid roles
        const validMessages = item.template.messages
          .filter((m: { role: string; content: string }) => validRoles.includes(m.role as ChatRole))
          .map((m: { role: string; content: string; name?: string }) => ({
            role: m.role as ChatRole,
            content: m.content,
            name: m.name,
          }));
        if (validMessages.length === 0) {
          errors.push(`Prompt ${i + 1} (${item.name}): no valid messages found`);
          continue;
        }
        template = { type: "chat", messages: validMessages };
      } else if (typeof item.template === "string") {
        // Simple string format - convert to text template
        template = { type: "text", text: item.template };
      } else {
        errors.push(`Prompt ${i + 1} (${item.name}): invalid template format`);
        continue;
      }

      prompts.push({
        name: item.name,
        slug: item.slug,
        description: item.description,
        tags: Array.isArray(item.tags) ? item.tags : [],
        template,
        variables: Array.isArray(item.variables) ? item.variables : undefined,
        config: typeof item.config === "object" ? item.config : undefined,
      });
    }
  } catch (e) {
    return {
      prompts: [],
      errors: [`Failed to parse JSON: ${e instanceof Error ? e.message : "Unknown error"}`],
    };
  }

  return { prompts, errors };
}

/**
 * Generate slug from name
 */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}
