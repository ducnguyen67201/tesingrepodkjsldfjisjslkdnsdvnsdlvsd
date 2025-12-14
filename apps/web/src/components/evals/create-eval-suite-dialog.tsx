"use client";

import { Plus, Loader2 } from "lucide-react";
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
import { useCreateEvalSuiteForm } from "@/hooks/use-create-eval-suite-form";
import { PromptCard } from "./prompt-card";

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
  const {
    form,
    errors,
    isCreating,
    updateField,
    updatePrompt,
    addPrompt,
    removePrompt,
    handleSubmit,
    reset,
  } = useCreateEvalSuiteForm({
    workspaceSlug,
    projectId,
    onSuccess: () => onOpenChange(false),
  });

  const handleClose = () => {
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl gap-0">
        <DialogHeader className="pb-4">
          <DialogTitle>Create Eval Suite</DialogTitle>
          <DialogDescription>
            Set up automated testing for your AI endpoint. Runs automatically on PR merge.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[60vh] -mx-6 px-6">
          <div className="space-y-6 pb-2">
            {/* Basic Info */}
            <BasicInfoSection form={form} errors={errors} updateField={updateField} />

            {/* Prompts Section */}
            <PromptsSection
              prompts={form.prompts}
              errors={errors}
              onAdd={addPrompt}
              onUpdate={updatePrompt}
              onRemove={removePrompt}
            />

            {/* Thresholds Section */}
            <ThresholdsSection form={form} updateField={updateField} />
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

// ============================================================
// Sub-components
// ============================================================

interface BasicInfoSectionProps {
  form: ReturnType<typeof useCreateEvalSuiteForm>["form"];
  errors: ReturnType<typeof useCreateEvalSuiteForm>["errors"];
  updateField: ReturnType<typeof useCreateEvalSuiteForm>["updateField"];
}

function BasicInfoSection({ form, errors, updateField }: BasicInfoSectionProps) {
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateField("name", e.target.value);
  };

  const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    updateField("description", e.target.value);
  };

  const handleEndpointChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateField("endpoint", e.target.value);
  };

  const handleEnabledChange = (checked: boolean) => {
    updateField("enabled", checked);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            placeholder="My eval suite"
            value={form.name}
            onChange={handleNameChange}
          />
          {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
        </div>
        <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-4">
          <div className="space-y-0.5">
            <Label className="text-sm font-medium">Enabled</Label>
            <p className="text-xs text-muted-foreground">Run on PR merge</p>
          </div>
          <Switch checked={form.enabled} onCheckedChange={handleEnabledChange} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          placeholder="What does this eval suite test?"
          value={form.description}
          onChange={handleDescriptionChange}
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
          onChange={handleEndpointChange}
        />
        <p className="text-xs text-muted-foreground">The API endpoint to send eval prompts to</p>
        {errors.endpoint && <p className="text-sm text-destructive">{errors.endpoint}</p>}
      </div>
    </div>
  );
}

interface PromptsSectionProps {
  prompts: ReturnType<typeof useCreateEvalSuiteForm>["form"]["prompts"];
  errors: ReturnType<typeof useCreateEvalSuiteForm>["errors"];
  onAdd: () => void;
  onUpdate: ReturnType<typeof useCreateEvalSuiteForm>["updatePrompt"];
  onRemove: (index: number) => void;
}

function PromptsSection({ prompts, errors, onAdd, onUpdate, onRemove }: PromptsSectionProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm font-medium">Prompts</Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Test prompts to send to your endpoint
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onAdd} className="h-8">
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add Prompt
        </Button>
      </div>
      {errors.prompts && <p className="text-sm text-destructive">{errors.prompts}</p>}

      <div className="space-y-3">
        {prompts.map((prompt, index) => (
          <PromptCard
            key={prompt.id}
            prompt={prompt}
            index={index}
            error={errors[`prompt-${index}`]}
            canDelete={prompts.length > 1}
            onUpdate={onUpdate}
            onRemove={onRemove}
          />
        ))}
      </div>
    </div>
  );
}

interface ThresholdsSectionProps {
  form: ReturnType<typeof useCreateEvalSuiteForm>["form"];
  updateField: ReturnType<typeof useCreateEvalSuiteForm>["updateField"];
}

function ThresholdsSection({ form, updateField }: ThresholdsSectionProps) {
  const handleLatencyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateField("latencyRegressionThreshold", parseFloat(e.target.value) || 1.2);
  };

  const handleErrorRateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateField("errorRegressionThreshold", parseFloat(e.target.value) || 2.0);
  };

  return (
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
            onChange={handleLatencyChange}
            className="h-9"
          />
          <p className="text-xs text-muted-foreground">Multiplier for regression (1.2 = 20% slower)</p>
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Error Rate Threshold</Label>
          <Input
            type="number"
            step="0.1"
            value={form.errorRegressionThreshold}
            onChange={handleErrorRateChange}
            className="h-9"
          />
          <p className="text-xs text-muted-foreground">Multiplier for regression (2.0 = 2x errors)</p>
        </div>
      </div>
    </div>
  );
}
