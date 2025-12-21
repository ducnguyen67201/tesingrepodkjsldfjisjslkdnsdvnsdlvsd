"use client";

import { useState, useCallback } from "react";
import { z } from "zod";
import { Loader2, Upload, FileJson, AlertCircle } from "lucide-react";
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

// ============================================================
// Zod Schemas for Import Validation
// ============================================================

const ChatRoleSchema = z.enum(["system", "user", "assistant", "tool"]);

const ChatMessageSchema = z.object({
  role: ChatRoleSchema,
  content: z.string(),
  name: z.string().optional(),
});

const TextTemplateSchema = z.object({
  type: z.literal("text"),
  text: z.string().min(1),
});

const ChatTemplateSchema = z.object({
  type: z.literal("chat"),
  messages: z.array(ChatMessageSchema).min(1),
});

const PromptTemplateSchema = z.discriminatedUnion("type", [
  TextTemplateSchema,
  ChatTemplateSchema,
]);

const PromptVariableSchema = z.object({
  name: z.string().min(1),
  required: z.boolean().optional(),
  default: z.string().optional(),
  description: z.string().optional(),
});

const ImportPromptSchema = z.object({
  name: z.string().min(1),
  slug: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  template: PromptTemplateSchema,
  variables: z.array(PromptVariableSchema).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

// Also support string template shorthand
const ImportPromptWithStringTemplateSchema = z.object({
  name: z.string().min(1),
  slug: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  template: z.string().min(1),
  variables: z.array(PromptVariableSchema).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

const ImportFileSchema = z.union([
  z.array(z.union([ImportPromptSchema, ImportPromptWithStringTemplateSchema])),
  z.object({
    prompts: z.array(z.union([ImportPromptSchema, ImportPromptWithStringTemplateSchema])),
  }),
]);

// ============================================================
// Types
// ============================================================

interface ImportPromptsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceSlug: string;
  projectId: string;
}

type ImportPrompt = z.infer<typeof ImportPromptSchema>;

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
        const parsed = parseImportFile(text);
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
 * Parse import file (JSON format) using Zod validation
 */
function parseImportFile(content: string): ParseResult {
  const errors: string[] = [];
  const prompts: ImportPrompt[] = [];

  // Parse JSON
  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch (e) {
    return {
      prompts: [],
      errors: [`Failed to parse JSON: ${e instanceof Error ? e.message : "Unknown error"}`],
    };
  }

  // Validate overall structure
  const fileResult = ImportFileSchema.safeParse(json);
  if (!fileResult.success) {
    return {
      prompts: [],
      errors: ["Invalid format: expected array of prompts or { prompts: [...] }"],
    };
  }

  // Extract prompts array
  const promptsArray = Array.isArray(fileResult.data)
    ? fileResult.data
    : fileResult.data.prompts;

  // Validate each prompt individually for better error messages
  for (let i = 0; i < promptsArray.length; i++) {
    const item = promptsArray[i];

    // Handle string template shorthand - convert to text template
    if (typeof item.template === "string") {
      const converted: ImportPrompt = {
        name: item.name,
        slug: item.slug,
        description: item.description,
        tags: item.tags,
        template: { type: "text", text: item.template },
        variables: item.variables,
        config: item.config,
      };
      prompts.push(converted);
      continue;
    }

    // Validate as standard ImportPrompt
    const promptResult = ImportPromptSchema.safeParse(item);
    if (!promptResult.success) {
      const fieldErrors = promptResult.error.flatten().fieldErrors;
      const errorMessages = Object.entries(fieldErrors)
        .map(([field, msgs]) => `${field}: ${msgs?.join(", ")}`)
        .join("; ");
      errors.push(`Prompt ${i + 1} (${item.name}): ${errorMessages}`);
      continue;
    }

    prompts.push(promptResult.data);
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
