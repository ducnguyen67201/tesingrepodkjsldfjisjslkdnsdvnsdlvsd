"use client";

import { useState, useCallback, useMemo } from "react";
import { Loader2, X } from "lucide-react";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { PromptVersionSelector } from "./prompt-version-selector";
import { usePromptExperiments, useExperimentTags } from "@/hooks/use-prompt-experiments";
import {
  ASSIGNMENT_KEY_LABELS,
  TOTAL_BASIS_POINTS,
  type AssignmentKeyType,
} from "@cognobserve/api/schemas";

// ============================================================
// Constants
// ============================================================

const MAX_NAME_LENGTH = 100;
const MAX_SLUG_LENGTH = 50;
const MAX_DESCRIPTION_LENGTH = 500;
const DEFAULT_WEIGHT_PERCENT = 50;

// ============================================================
// Props
// ============================================================

interface CreateExperimentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceSlug: string;
  projectId: string;
}

// ============================================================
// Component
// ============================================================

export function CreateExperimentDialog({
  open,
  onOpenChange,
  workspaceSlug,
  projectId,
}: CreateExperimentDialogProps) {
  // Hooks
  const { createExperiment, isCreating } = usePromptExperiments({
    workspaceSlug,
    projectId,
  });
  const existingTags = useExperimentTags({ workspaceSlug, projectId });

  // Form state - basic info
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");

  // Form state - variants
  const [variantAVersionId, setVariantAVersionId] = useState("");
  const [variantBVersionId, setVariantBVersionId] = useState("");
  const [weightA, setWeightA] = useState(DEFAULT_WEIGHT_PERCENT);

  // Form state - configuration
  const [allocationPct, setAllocationPct] = useState(100);
  const [assignmentKey, setAssignmentKey] = useState<AssignmentKeyType>("userId");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  // Computed values
  const weightB = 100 - weightA;

  // Generate slug from name
  const generateSlug = useCallback((value: string) => {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, MAX_SLUG_LENGTH);
  }, []);

  // Validation
  const isValid = useMemo(() => {
    return (
      name.trim().length > 0 &&
      slug.trim().length > 0 &&
      variantAVersionId.length > 0 &&
      variantBVersionId.length > 0 &&
      variantAVersionId !== variantBVersionId
    );
  }, [name, slug, variantAVersionId, variantBVersionId]);

  // Handlers - Basic Info
  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value.slice(0, MAX_NAME_LENGTH);
      setName(value);
      if (!slug || slug === generateSlug(name)) {
        setSlug(generateSlug(value));
      }
    },
    [name, slug, generateSlug]
  );

  const handleSlugChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "")
      .slice(0, MAX_SLUG_LENGTH);
    setSlug(value);
  }, []);

  const handleDescriptionChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDescription(e.target.value.slice(0, MAX_DESCRIPTION_LENGTH));
  }, []);

  // Handlers - Weights
  const handleWeightChange = useCallback((value: number[]) => {
    if (value[0] !== undefined) {
      setWeightA(value[0]);
    }
  }, []);

  // Handlers - Configuration
  const handleAllocationChange = useCallback((value: number[]) => {
    if (value[0] !== undefined) {
      setAllocationPct(value[0]);
    }
  }, []);

  const handleAssignmentKeyChange = useCallback((value: string) => {
    setAssignmentKey(value as AssignmentKeyType);
  }, []);

  // Handlers - Tags
  const handleTagInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setTagInput(e.target.value);
  }, []);

  const handleTagInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        const newTag = tagInput.trim();
        if (newTag && !tags.includes(newTag)) {
          setTags((prev) => [...prev, newTag]);
        }
        setTagInput("");
      }
    },
    [tagInput, tags]
  );

  const handleRemoveTag = useCallback((tagToRemove: string) => {
    setTags((prev) => prev.filter((t) => t !== tagToRemove));
  }, []);

  const handleAddExistingTag = useCallback(
    (tag: string) => {
      if (!tags.includes(tag)) {
        setTags((prev) => [...prev, tag]);
      }
    },
    [tags]
  );

  // Close and reset
  const handleClose = useCallback(() => {
    setName("");
    setSlug("");
    setDescription("");
    setVariantAVersionId("");
    setVariantBVersionId("");
    setWeightA(DEFAULT_WEIGHT_PERCENT);
    setAllocationPct(100);
    setAssignmentKey("userId");
    setTags([]);
    setTagInput("");
    onOpenChange(false);
  }, [onOpenChange]);

  // Submit handler
  const handleSubmit = useCallback(async () => {
    if (!isValid) return;

    const weightABasisPoints = Math.round((weightA / 100) * TOTAL_BASIS_POINTS);
    const weightBBasisPoints = TOTAL_BASIS_POINTS - weightABasisPoints;

    await createExperiment({
      workspaceSlug,
      projectId,
      name: name.trim(),
      slug: slug.trim(),
      description: description.trim() || undefined,
      allocationPct,
      assignmentKey,
      tags,
      variants: [
        {
          name: "A",
          weight: weightABasisPoints,
          promptVersionId: variantAVersionId,
          isControl: true,
        },
        {
          name: "B",
          weight: weightBBasisPoints,
          promptVersionId: variantBVersionId,
          isControl: false,
        },
      ],
    });

    handleClose();
  }, [
    isValid,
    createExperiment,
    workspaceSlug,
    projectId,
    name,
    slug,
    description,
    allocationPct,
    assignmentKey,
    tags,
    weightA,
    variantAVersionId,
    variantBVersionId,
    handleClose,
  ]);

  // Render tag removal handler
  const renderTagBadge = useCallback(
    (tag: string) => {
      const handleClick = () => handleRemoveTag(tag);
      return (
        <Badge key={tag} variant="secondary" className="gap-1">
          {tag}
          <button type="button" onClick={handleClick} className="hover:text-destructive">
            <X className="h-3 w-3" />
          </button>
        </Badge>
      );
    },
    [handleRemoveTag]
  );

  // Render existing tag suggestion
  const renderExistingTag = useCallback(
    (tag: string) => {
      if (tags.includes(tag)) return null;
      const handleClick = () => handleAddExistingTag(tag);
      return (
        <Badge
          key={tag}
          variant="outline"
          className="cursor-pointer hover:bg-secondary"
          onClick={handleClick}
        >
          {tag}
        </Badge>
      );
    },
    [tags, handleAddExistingTag]
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl gap-0">
        <DialogHeader className="pb-4">
          <DialogTitle>Create A/B Experiment</DialogTitle>
          <DialogDescription>
            Create a new prompt A/B experiment to compare two prompt versions.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[60vh] -mx-6 px-6">
          <div className="space-y-6 pb-2">
            {/* Basic Info Section */}
            <BasicInfoSection
              name={name}
              slug={slug}
              description={description}
              onNameChange={handleNameChange}
              onSlugChange={handleSlugChange}
              onDescriptionChange={handleDescriptionChange}
            />

            {/* Variants Section */}
            <VariantsSection
              workspaceSlug={workspaceSlug}
              projectId={projectId}
              variantAVersionId={variantAVersionId}
              variantBVersionId={variantBVersionId}
              weightA={weightA}
              weightB={weightB}
              onVariantAChange={setVariantAVersionId}
              onVariantBChange={setVariantBVersionId}
              onWeightChange={handleWeightChange}
              disabled={isCreating}
            />

            {/* Configuration Section */}
            <ConfigurationSection
              allocationPct={allocationPct}
              assignmentKey={assignmentKey}
              onAllocationChange={handleAllocationChange}
              onAssignmentKeyChange={handleAssignmentKeyChange}
            />

            {/* Tags Section */}
            <div className="space-y-3">
              <Label>Tags (optional)</Label>
              <Input
                placeholder="Type and press Enter to add"
                value={tagInput}
                onChange={handleTagInputChange}
                onKeyDown={handleTagInputKeyDown}
                disabled={isCreating}
              />
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">{tags.map(renderTagBadge)}</div>
              )}
              {existingTags.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">Existing tags:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {existingTags.map(renderExistingTag)}
                  </div>
                </div>
              )}
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="pt-4 border-t mt-4">
          <Button type="button" variant="outline" onClick={handleClose} disabled={isCreating}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isCreating || !isValid}>
            {isCreating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Experiment"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Sub-components (extracted for readability)
// ============================================================

interface BasicInfoSectionProps {
  name: string;
  slug: string;
  description: string;
  onNameChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSlugChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDescriptionChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
}

function BasicInfoSection({
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

function VariantsSection({
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

interface ConfigurationSectionProps {
  allocationPct: number;
  assignmentKey: AssignmentKeyType;
  onAllocationChange: (value: number[]) => void;
  onAssignmentKeyChange: (value: string) => void;
}

function ConfigurationSection({
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
          Percentage of traffic to include in the experiment (remaining traffic uses fallback)
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
