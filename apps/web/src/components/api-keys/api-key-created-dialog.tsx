"use client";

import { useState } from "react";
import { AlertTriangle, Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CodeSnippets } from "./code-snippets";
import { COPY_TIMEOUT_MS } from "@/lib/constants/api-keys";

interface ApiKeyCreatedDialogProps {
  open: boolean;
  onClose: () => void;
  apiKey: {
    name: string;
    key: string;
    displayKey: string;
  } | null;
}

export function ApiKeyCreatedDialog({ open, onClose, apiKey }: ApiKeyCreatedDialogProps) {
  const [copied, setCopied] = useState(false);

  if (!apiKey) return null;

  const handleCopyKey = async () => {
    try {
      await navigator.clipboard.writeText(apiKey.key);
      setCopied(true);
      setTimeout(() => setCopied(false), COPY_TIMEOUT_MS);
    } catch {
      console.error("Failed to copy to clipboard");
    }
  };

  const handleClose = () => {
    setCopied(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="sm:max-w-2xl"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>API Key Created Successfully</DialogTitle>
          <DialogDescription>
            Your &quot;{apiKey.name}&quot; key is ready to use.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <Alert className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Make sure to copy your API key now. You won&apos;t be able to see it again!
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <label className="text-sm font-medium">Your API Key</label>
            <div className="flex items-center gap-2">
              <div className="flex-1 rounded-md border bg-muted p-3 font-mono text-sm">
                {apiKey.key}
              </div>
              <Button variant="outline" size="icon" onClick={handleCopyKey}>
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
            {copied && (
              <p className="text-xs text-green-600 dark:text-green-400">
                Copied to clipboard!
              </p>
            )}
          </div>

          <CodeSnippets apiKey={apiKey.key} />
        </div>

        <DialogFooter>
          <Button onClick={handleClose}>I&apos;ve saved my key</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
