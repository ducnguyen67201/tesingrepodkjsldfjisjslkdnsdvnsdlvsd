"use client";

import { useCallback } from "react";
import { X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface TagsInputSectionProps {
  tags: string[];
  tagInput: string;
  existingTags: string[];
  disabled: boolean;
  onTagInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onTagInputKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onRemoveTag: (tag: string) => void;
  onAddExistingTag: (tag: string) => void;
}

export function TagsInputSection({
  tags,
  tagInput,
  existingTags,
  disabled,
  onTagInputChange,
  onTagInputKeyDown,
  onRemoveTag,
  onAddExistingTag,
}: TagsInputSectionProps) {
  const renderTagBadge = useCallback(
    (tag: string) => {
      const handleClick = () => onRemoveTag(tag);
      return (
        <Badge key={tag} variant="secondary" className="gap-1">
          {tag}
          <button
            type="button"
            onClick={handleClick}
            className="hover:text-destructive"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      );
    },
    [onRemoveTag]
  );

  const renderExistingTag = useCallback(
    (tag: string) => {
      if (tags.includes(tag)) return null;
      const handleClick = () => onAddExistingTag(tag);
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
    [tags, onAddExistingTag]
  );

  return (
    <div className="space-y-3">
      <Label>Tags (optional)</Label>
      <Input
        placeholder="Type and press Enter to add"
        value={tagInput}
        onChange={onTagInputChange}
        onKeyDown={onTagInputKeyDown}
        disabled={disabled}
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
  );
}
