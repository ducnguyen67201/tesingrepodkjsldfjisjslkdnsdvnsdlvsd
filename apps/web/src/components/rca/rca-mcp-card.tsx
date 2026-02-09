"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Copy, Check, Terminal } from "lucide-react";
import { clipboardToast } from "@/lib/success";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CONSTANTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const COPY_RESET_DELAY_MS = 2000;

const MCP_CONFIG_TEMPLATE = `{
  "mcpServers": {
    "ducsigr": {
      "command": "npx",
      "args": ["-y", "@ducsigr/mcp@latest"],
      "env": {
        "DUCSIGR_API_KEY": "<your-api-key>",
        "DUCSIGR_API_URL": "<your-ducsigr-url>"
      }
    }
  }
}`;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PROPS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface RCAMCPSetupProps {
  rcaId: string;
  alertName: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// COMPONENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function RCAMCPSetup({ rcaId, alertName }: RCAMCPSetupProps) {
  const [copiedConfig, setCopiedConfig] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  const mcpPrompt = `Use the get_rca tool to fetch RCA "${rcaId}" and help me fix the issue "${alertName}". Read the analysis, check suspected commits, and suggest a code fix.`;

  const handleCopyConfig = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(MCP_CONFIG_TEMPLATE);
      setCopiedConfig(true);
      clipboardToast.copied("MCP config");
      setTimeout(() => setCopiedConfig(false), COPY_RESET_DELAY_MS);
    } catch {
      clipboardToast.copyFailed();
    }
  }, []);

  const handleCopyPrompt = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(mcpPrompt);
      setCopiedPrompt(true);
      clipboardToast.copied("prompt");
      setTimeout(() => setCopiedPrompt(false), COPY_RESET_DELAY_MS);
    } catch {
      clipboardToast.copyFailed();
    }
  }, [mcpPrompt]);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setCopiedConfig(false);
      setCopiedPrompt(false);
    }
  };

  return (
    <Dialog onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="default" className="gap-2">
          <Terminal className="h-4 w-4" />
          MCP Setup
          <Badge variant="outline" className="text-[10px] px-1 py-0">MCP</Badge>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            Use with AI Agent
          </DialogTitle>
          <DialogDescription>
            Connect your AI coding assistant to automatically retrieve this RCA
            data and suggest fixes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Quick prompt */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium">
              Quick: Paste this prompt in Claude Code
            </h4>
            <div className="relative">
              <pre className="bg-muted rounded-md p-3 pr-12 text-xs font-mono overflow-x-auto whitespace-pre-wrap">
                {mcpPrompt}
              </pre>
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2 h-7 w-7"
                onClick={handleCopyPrompt}
              >
                {copiedPrompt ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          </div>

          {/* MCP Config */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium">
              Setup: Add Ducsigr MCP to your config
            </h4>
            <div className="relative">
              <pre className="bg-muted rounded-md p-3 pr-12 text-xs font-mono overflow-x-auto">
                {MCP_CONFIG_TEMPLATE}
              </pre>
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2 h-7 w-7"
                onClick={handleCopyConfig}
              >
                {copiedConfig ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Add to{" "}
              <code className="bg-muted px-1 rounded">
                ~/.claude/claude_desktop_config.json
              </code>{" "}
              or your IDE&apos;s MCP settings.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
