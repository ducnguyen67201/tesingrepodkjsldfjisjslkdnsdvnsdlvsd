"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Copy, Check, Wand2, Loader2 } from "lucide-react";
import { useGenerateFixPrompt } from "@/hooks/use-rca-detail";
import { rcaToast, clipboardToast } from "@/lib/success";

interface RCACopyFixPromptProps {
  workspaceSlug: string;
  rcaId: string;
}

export function RCACopyFixPrompt({ workspaceSlug, rcaId }: RCACopyFixPromptProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const { data, isLoading, error } = useGenerateFixPrompt({
    workspaceSlug,
    rcaId,
    enabled: open, // Only fetch when dialog opens
  });

  const handleCopy = async () => {
    if (!data?.prompt) return;

    try {
      await navigator.clipboard.writeText(data.prompt);
      setCopied(true);
      rcaToast.promptCopied();
      setTimeout(() => setCopied(false), 2000);
    } catch {
      clipboardToast.copyFailed();
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      setCopied(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="default" size="default" className="gap-2">
          <Wand2 className="h-4 w-4" />
          Copy Fix Prompt for AI Agent
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5" />
            AI Agent Fix Prompt
          </DialogTitle>
          <DialogDescription>
            Copy this prompt and paste it into your AI coding assistant (Claude Code, GitHub
            Copilot, Cursor, etc.) to get help fixing this issue.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && (
            <div className="text-destructive text-sm py-4 text-center">
              Failed to generate prompt. Please try again.
            </div>
          )}

          {data?.prompt && (
            <>
              <div className="relative">
                <Textarea
                  value={data.prompt}
                  readOnly
                  className="font-mono text-sm h-[400px] resize-none"
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Close
                </Button>
                <Button onClick={handleCopy}>
                  {copied ? (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 mr-2" />
                      Copy to Clipboard
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
