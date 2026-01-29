"use client";

import { useCallback } from "react";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { useExperimentForm } from "@/hooks/use-experiment-form";
import {
  BasicInfoSection,
  VariantsSection,
  ConfigurationSection,
} from "./create-experiment-form-sections";
import { TagsInputSection } from "./tags-input-section";

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
  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const form = useExperimentForm({
    workspaceSlug,
    projectId,
    onSuccess: handleClose,
  });

  const handleDialogClose = useCallback(() => {
    form.resetForm();
    handleClose();
  }, [form, handleClose]);

  return (
    <Dialog open={open} onOpenChange={handleDialogClose}>
      <DialogContent className="max-w-2xl gap-0">
        <DialogHeader className="pb-4">
          <DialogTitle>Create A/B Experiment</DialogTitle>
          <DialogDescription>
            Create a new prompt A/B experiment to compare two prompt versions.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[60vh] -mx-6 px-6">
          <div className="space-y-6 pb-2">
            <BasicInfoSection
              name={form.name}
              slug={form.slug}
              description={form.description}
              onNameChange={form.handleNameChange}
              onSlugChange={form.handleSlugChange}
              onDescriptionChange={form.handleDescriptionChange}
            />

            <VariantsSection
              workspaceSlug={workspaceSlug}
              projectId={projectId}
              variantAVersionId={form.variantAVersionId}
              variantBVersionId={form.variantBVersionId}
              weightA={form.weightA}
              weightB={form.weightB}
              onVariantAChange={form.setVariantAVersionId}
              onVariantBChange={form.setVariantBVersionId}
              onWeightChange={form.handleWeightChange}
              disabled={form.isCreating}
            />

            <ConfigurationSection
              allocationPct={form.allocationPct}
              assignmentKey={form.assignmentKey}
              onAllocationChange={form.handleAllocationChange}
              onAssignmentKeyChange={form.handleAssignmentKeyChange}
            />

            <TagsInputSection
              tags={form.tags}
              tagInput={form.tagInput}
              existingTags={form.existingTags}
              disabled={form.isCreating}
              onTagInputChange={form.handleTagInputChange}
              onTagInputKeyDown={form.handleTagInputKeyDown}
              onRemoveTag={form.handleRemoveTag}
              onAddExistingTag={form.handleAddExistingTag}
            />
          </div>
        </ScrollArea>

        <DialogFooter className="pt-4 border-t mt-4">
          <Button
            type="button"
            variant="outline"
            onClick={handleDialogClose}
            disabled={form.isCreating}
          >
            Cancel
          </Button>
          <Button
            onClick={form.handleSubmit}
            disabled={form.isCreating || !form.isValid}
          >
            {form.isCreating ? (
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
