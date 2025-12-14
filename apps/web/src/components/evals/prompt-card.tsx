"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { EvalPromptForm } from "@/hooks/use-create-eval-suite-form";

interface PromptCardProps {
  prompt: EvalPromptForm;
  index: number;
  error?: string;
  canDelete: boolean;
  onUpdate: (index: number, field: keyof EvalPromptForm, value: string | number | boolean) => void;
  onRemove: (index: number) => void;
}

export function PromptCard({
  prompt,
  index,
  error,
  canDelete,
  onUpdate,
  onRemove,
}: PromptCardProps) {
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdate(index, "name", e.target.value);
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onUpdate(index, "content", e.target.value);
  };

  const handlePatternChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdate(index, "expectedPattern", e.target.value);
  };

  const handleLatencyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdate(index, "maxLatencyMs", e.target.value ? parseInt(e.target.value) : 0);
  };

  const handleRemove = () => {
    onRemove(index);
  };

  return (
    <div className="rounded-lg border bg-card p-4 space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex-1 space-y-2">
          <Label className="text-xs text-muted-foreground">Prompt Name</Label>
          <Input
            value={prompt.name}
            onChange={handleNameChange}
            className="h-9"
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleRemove}
          disabled={!canDelete}
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
          onChange={handleContentChange}
          className="resize-none"
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Expected Pattern (optional)</Label>
          <Input
            placeholder="Regex or substring"
            value={prompt.expectedPattern ?? ""}
            onChange={handlePatternChange}
            className="h-9"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Max Latency (ms)</Label>
          <Input
            type="number"
            placeholder="5000"
            value={prompt.maxLatencyMs ?? ""}
            onChange={handleLatencyChange}
            className="h-9"
          />
        </div>
      </div>
    </div>
  );
}
