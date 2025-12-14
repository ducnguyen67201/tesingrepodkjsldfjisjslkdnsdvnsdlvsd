"use client";

import { useState, useCallback } from "react";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useEvalSuites } from "@/hooks/use-eval-suites";

interface Prompt {
  id: string;
  name: string;
  content: string;
  expectedPattern?: string;
  maxLatencyMs?: number;
  required: boolean;
}

interface FormState {
  name: string;
  description: string;
  endpoint: string;
  enabled: boolean;
  prompts: Prompt[];
  latencyRegressionThreshold: number;
  errorRegressionThreshold: number;
}

const INITIAL_STATE: FormState = {
  name: "",
  description: "",
  endpoint: "",
  enabled: true,
  prompts: [
    {
      id: crypto.randomUUID(),
      name: "Test prompt",
      content: "",
      required: true,
    },
  ],
  latencyRegressionThreshold: 1.2,
  errorRegressionThreshold: 2.0,
};

interface CreateEvalSuiteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceSlug: string;
  projectId: string;
}

export function CreateEvalSuiteDialog({
  open,
  onOpenChange,
  workspaceSlug,
  projectId,
}: CreateEvalSuiteDialogProps) {
  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { createSuite, isCreating } = useEvalSuites({
    workspaceSlug,
    projectId,
  });

  const updateField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: "" }));
  }, []);

  const updatePrompt = useCallback((index: number, field: keyof Prompt, value: string | number | boolean) => {
    setForm((prev) => ({
      ...prev,
      prompts: prev.prompts.map((p, i) =>
        i === index ? { ...p, [field]: value } : p
      ),
    }));
  }, []);

  const addPrompt = useCallback(() => {
    setForm((prev) => ({
      ...prev,
      prompts: [
        ...prev.prompts,
        {
          id: crypto.randomUUID(),
          name: `Prompt ${prev.prompts.length + 1}`,
          content: "",
          required: true,
        },
      ],
    }));
  }, []);

  const removePrompt = useCallback((index: number) => {
    setForm((prev) => ({
      ...prev,
      prompts: prev.prompts.filter((_, i) => i !== index),
    }));
  }, []);

  const validate = useCallback(() => {
    const newErrors: Record<string, string> = {};

    if (!form.name.trim()) {
      newErrors.name = "Name is required";
    }

    if (!form.endpoint.trim()) {
      newErrors.endpoint = "Endpoint URL is required";
    } else {
      try {
        new URL(form.endpoint);
      } catch {
        newErrors.endpoint = "Must be a valid URL";
      }
    }

    if (form.prompts.length === 0) {
      newErrors.prompts = "At least one prompt is required";
    }

    form.prompts.forEach((prompt, index) => {
      if (!prompt.content.trim()) {
        newErrors[`prompt-${index}`] = "Prompt content is required";
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [form]);

  const handleSubmit = useCallback(async () => {
    if (!validate()) return;

    await createSuite({
      workspaceSlug,
      projectId,
      name: form.name,
      description: form.description || undefined,
      endpoint: form.endpoint,
      enabled: form.enabled,
      prompts: form.prompts,
      expectedBehaviors: [],
      latencyRegressionThreshold: form.latencyRegressionThreshold,
      errorRegressionThreshold: form.errorRegressionThreshold,
    });

    setForm(INITIAL_STATE);
    onOpenChange(false);
  }, [createSuite, workspaceSlug, projectId, form, validate, onOpenChange]);

  const handleClose = useCallback(() => {
    setForm(INITIAL_STATE);
    setErrors({});
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl gap-0">
        <DialogHeader className="pb-4">
          <DialogTitle>Create Eval Suite</DialogTitle>
          <DialogDescription>
            Set up automated testing for your AI endpoint. Runs automatically on
            PR merge.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[60vh] -mx-6 px-6">
          <div className="space-y-6 pb-2">
            {/* Basic Info */}
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    placeholder="My eval suite"
                    value={form.name}
                    onChange={(e) => updateField("name", e.target.value)}
                  />
                  {errors.name && (
                    <p className="text-sm text-destructive">{errors.name}</p>
                  )}
                </div>
                <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-4">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">Enabled</Label>
                    <p className="text-xs text-muted-foreground">Run on PR merge</p>
                  </div>
                  <Switch
                    checked={form.enabled}
                    onCheckedChange={(checked) => updateField("enabled", checked)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="What does this eval suite test?"
                  value={form.description}
                  onChange={(e) => updateField("description", e.target.value)}
                  className="resize-none"
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="endpoint">Endpoint URL</Label>
                <Input
                  id="endpoint"
                  placeholder="https://api.example.com/chat"
                  value={form.endpoint}
                  onChange={(e) => updateField("endpoint", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  The API endpoint to send eval prompts to
                </p>
                {errors.endpoint && (
                  <p className="text-sm text-destructive">{errors.endpoint}</p>
                )}
              </div>
            </div>

            {/* Prompts Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">Prompts</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Test prompts to send to your endpoint
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addPrompt}
                  className="h-8"
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Add Prompt
                </Button>
              </div>
              {errors.prompts && (
                <p className="text-sm text-destructive">{errors.prompts}</p>
              )}

              <div className="space-y-3">
                {form.prompts.map((prompt, index) => (
                  <div key={prompt.id} className="rounded-lg border bg-card p-4 space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 space-y-2">
                        <Label className="text-xs text-muted-foreground">Prompt Name</Label>
                        <Input
                          value={prompt.name}
                          onChange={(e) => updatePrompt(index, "name", e.target.value)}
                          className="h-9"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removePrompt(index)}
                        disabled={form.prompts.length <= 1}
                        className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Content</Label>
                      <Textarea
                        placeholder="Enter the prompt to test..."
                        rows={2}
                        value={prompt.content}
                        onChange={(e) => updatePrompt(index, "content", e.target.value)}
                        className="resize-none"
                      />
                      {errors[`prompt-${index}`] && (
                        <p className="text-sm text-destructive">{errors[`prompt-${index}`]}</p>
                      )}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Expected Pattern (optional)</Label>
                        <Input
                          placeholder="Regex or substring"
                          value={prompt.expectedPattern ?? ""}
                          onChange={(e) => updatePrompt(index, "expectedPattern", e.target.value)}
                          className="h-9"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Max Latency (ms)</Label>
                        <Input
                          type="number"
                          placeholder="5000"
                          value={prompt.maxLatencyMs ?? ""}
                          onChange={(e) =>
                            updatePrompt(
                              index,
                              "maxLatencyMs",
                              e.target.value ? parseInt(e.target.value) : 0
                            )
                          }
                          className="h-9"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Thresholds Section */}
            <div className="space-y-3">
              <div>
                <Label className="text-sm font-medium">Regression Thresholds</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Configure when to flag performance regressions
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Latency Threshold</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={form.latencyRegressionThreshold}
                    onChange={(e) =>
                      updateField("latencyRegressionThreshold", parseFloat(e.target.value) || 1.2)
                    }
                    className="h-9"
                  />
                  <p className="text-xs text-muted-foreground">
                    Multiplier for regression (1.2 = 20% slower)
                  </p>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Error Rate Threshold</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={form.errorRegressionThreshold}
                    onChange={(e) =>
                      updateField("errorRegressionThreshold", parseFloat(e.target.value) || 2.0)
                    }
                    className="h-9"
                  />
                  <p className="text-xs text-muted-foreground">
                    Multiplier for regression (2.0 = 2x errors)
                  </p>
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="pt-4 border-t mt-4">
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isCreating}>
            {isCreating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Suite"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
