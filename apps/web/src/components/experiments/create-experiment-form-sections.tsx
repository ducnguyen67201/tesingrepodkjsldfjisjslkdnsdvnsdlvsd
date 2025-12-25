"use client";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PromptVersionSelector } from "./prompt-version-selector";
import {
  ASSIGNMENT_KEY_LABELS,
  type AssignmentKeyType,
} from "@cognobserve/api/schemas";

// ============================================================
// Basic Info Section
// ============================================================

interface BasicInfoSectionProps {
  name: string;
  slug: string;
  description: string;
  onNameChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSlugChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDescriptionChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
}

export function BasicInfoSection({
  name,
  slug,
  description,
  onNameChange,
  onSlugChange,
  onDescriptionChange,
}: BasicInfoSectionProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="exp-name">Name</Label>
        <Input
          id="exp-name"
          placeholder="Improved System Prompt Test"
          value={name}
          onChange={onNameChange}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="exp-slug">Slug</Label>
        <Input
          id="exp-slug"
          placeholder="improved-system-prompt-test"
          value={slug}
          onChange={onSlugChange}
          className="font-mono"
        />
        <p className="text-xs text-muted-foreground">
          Use this slug to reference the experiment in SDK calls
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="exp-description">Description (optional)</Label>
        <Textarea
          id="exp-description"
          placeholder="Testing whether the new system prompt improves response quality..."
          value={description}
          onChange={onDescriptionChange}
          rows={2}
        />
      </div>
    </div>
  );
}

// ============================================================
// Variants Section
// ============================================================

interface VariantsSectionProps {
  workspaceSlug: string;
  projectId: string;
  variantAVersionId: string;
  variantBVersionId: string;
  weightA: number;
  weightB: number;
  onVariantAChange: (versionId: string) => void;
  onVariantBChange: (versionId: string) => void;
  onWeightChange: (value: number[]) => void;
  disabled: boolean;
}

export function VariantsSection({
  workspaceSlug,
  projectId,
  variantAVersionId,
  variantBVersionId,
  weightA,
  weightB,
  onVariantAChange,
  onVariantBChange,
  onWeightChange,
  disabled,
}: VariantsSectionProps) {
  return (
    <div className="space-y-4">
      <Label className="text-base font-semibold">Variants</Label>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <PromptVersionSelector
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            label="Variant A (Control)"
            selectedVersionId={variantAVersionId}
            onVersionSelect={onVariantAChange}
            disabled={disabled}
          />
        </div>

        <div className="space-y-2">
          <PromptVersionSelector
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            label="Variant B (Treatment)"
            selectedVersionId={variantBVersionId}
            onVersionSelect={onVariantBChange}
            disabled={disabled}
          />
        </div>
      </div>

      {variantAVersionId === variantBVersionId &&
        variantAVersionId.length > 0 && (
          <p className="text-sm text-destructive">
            Variants must use different prompt versions
          </p>
        )}

      <div className="space-y-3">
        <div className="flex justify-between text-sm">
          <span>A: {weightA}%</span>
          <span>B: {weightB}%</span>
        </div>
        <Slider
          value={[weightA]}
          onValueChange={onWeightChange}
          min={1}
          max={99}
          step={1}
          disabled={disabled}
        />
        <p className="text-xs text-muted-foreground">
          Adjust the traffic split between variants (must sum to 100%)
        </p>
      </div>
    </div>
  );
}

// ============================================================
// Configuration Section
// ============================================================

interface ConfigurationSectionProps {
  allocationPct: number;
  assignmentKey: AssignmentKeyType;
  onAllocationChange: (value: number[]) => void;
  onAssignmentKeyChange: (value: string) => void;
}

export function ConfigurationSection({
  allocationPct,
  assignmentKey,
  onAllocationChange,
  onAssignmentKeyChange,
}: ConfigurationSectionProps) {
  return (
    <div className="space-y-4">
      <Label className="text-base font-semibold">Configuration</Label>

      <div className="space-y-3">
        <div className="flex justify-between text-sm">
          <span>Traffic Allocation</span>
          <span>{allocationPct}%</span>
        </div>
        <Slider
          value={[allocationPct]}
          onValueChange={onAllocationChange}
          min={1}
          max={100}
          step={1}
        />
        <p className="text-xs text-muted-foreground">
          Percentage of traffic to include in the experiment (remaining traffic
          uses fallback)
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="assignment-key">Assignment Key</Label>
        <Select value={assignmentKey} onValueChange={onAssignmentKeyChange}>
          <SelectTrigger id="assignment-key">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(ASSIGNMENT_KEY_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Determines how users are consistently bucketed into variants
        </p>
      </div>
    </div>
  );
}
