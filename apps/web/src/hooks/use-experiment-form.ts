import { useState, useCallback, useMemo } from "react";
import { usePromptExperiments, useExperimentTags } from "./use-prompt-experiments";
import {
  TOTAL_BASIS_POINTS,
  type AssignmentKeyType,
} from "@ducsigr/api/schemas";

// ============================================================
// Constants
// ============================================================

const MAX_NAME_LENGTH = 100;
const MAX_SLUG_LENGTH = 50;
const MAX_DESCRIPTION_LENGTH = 500;
const DEFAULT_WEIGHT_PERCENT = 50;

// ============================================================
// Types
// ============================================================

interface UseExperimentFormProps {
  workspaceSlug: string;
  projectId: string;
  onSuccess?: () => void;
}

// ============================================================
// Hook
// ============================================================

export function useExperimentForm({
  workspaceSlug,
  projectId,
  onSuccess,
}: UseExperimentFormProps) {
  // API hooks
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
  const [assignmentKey, setAssignmentKey] =
    useState<AssignmentKeyType>("userId");
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

  const handleSlugChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "")
        .slice(0, MAX_SLUG_LENGTH);
      setSlug(value);
    },
    []
  );

  const handleDescriptionChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setDescription(e.target.value.slice(0, MAX_DESCRIPTION_LENGTH));
    },
    []
  );

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
  const handleTagInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setTagInput(e.target.value);
    },
    []
  );

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

  // Reset form
  const resetForm = useCallback(() => {
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
  }, []);

  // Submit handler
  const handleSubmit = useCallback(async () => {
    if (!isValid) return;

    const weightABasisPoints = Math.round(
      (weightA / 100) * TOTAL_BASIS_POINTS
    );
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

    resetForm();
    onSuccess?.();
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
    resetForm,
    onSuccess,
  ]);

  return {
    // State
    name,
    slug,
    description,
    variantAVersionId,
    variantBVersionId,
    weightA,
    weightB,
    allocationPct,
    assignmentKey,
    tags,
    tagInput,
    existingTags,
    isValid,
    isCreating,

    // Handlers - Basic Info
    handleNameChange,
    handleSlugChange,
    handleDescriptionChange,

    // Handlers - Variants
    setVariantAVersionId,
    setVariantBVersionId,
    handleWeightChange,

    // Handlers - Configuration
    handleAllocationChange,
    handleAssignmentKeyChange,

    // Handlers - Tags
    handleTagInputChange,
    handleTagInputKeyDown,
    handleRemoveTag,
    handleAddExistingTag,

    // Actions
    handleSubmit,
    resetForm,
  };
}
