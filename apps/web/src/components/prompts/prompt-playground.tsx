"use client";

import { useState, useCallback, useMemo } from "react";
import { Play, Loader2, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { trpc } from "@/lib/trpc/client";
import { showError } from "@/lib/errors";
import { clipboardToast } from "@/lib/success";

interface PromptPlaygroundProps {
  workspaceSlug: string;
  promptId: string;
  versionId: string;
  promptName: string;
  version: number;
  type: "text" | "chat";
  content:
    | { type: "text"; text: string }
    | { type: "chat"; messages: Array<{ role: string; content: string }> };
  config?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  } | null;
}

const AVAILABLE_MODELS = [
  { value: "gpt-4o", label: "GPT-4o" },
  { value: "gpt-4o-mini", label: "GPT-4o Mini" },
  { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
  { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo" },
  { value: "claude-3-5-sonnet-latest", label: "Claude 3.5 Sonnet" },
  { value: "claude-3-5-haiku-latest", label: "Claude 3.5 Haiku" },
];

/**
 * Extract variable names from template content
 */
function extractVariables(content: PromptPlaygroundProps["content"]): string[] {
  const regex = /\{\{(\w+)\}\}/g;
  const variables = new Set<string>();
  let text = "";

  if (content.type === "text") {
    text = content.text;
  } else {
    text = content.messages.map((m) => m.content).join(" ");
  }

  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match[1]) {
      variables.add(match[1]);
    }
  }
  return Array.from(variables);
}

export function PromptPlayground({
  workspaceSlug,
  promptId,
  versionId,
  promptName,
  version,
  type,
  content,
  config,
}: PromptPlaygroundProps) {
  // Extract variables from content
  const detectedVariables = useMemo(() => extractVariables(content), [content]);

  // State
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [model, setModel] = useState(config?.model ?? "gpt-4o-mini");
  const [temperature, setTemperature] = useState(config?.temperature ?? 0.7);
  const [response, setResponse] = useState<{
    output: string;
    model: string;
    latencyMs: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cost: number;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // Mutation
  const runMutation = trpc.prompts.runPlayground.useMutation({
    onSuccess: (data) => {
      setResponse(data);
    },
    onError: showError,
  });

  // Handlers
  const handleVariableChange = useCallback((name: string, value: string) => {
    setVariables((prev) => ({ ...prev, [name]: value }));
  }, []);

  const handleRun = useCallback(() => {
    runMutation.mutate({
      workspaceSlug,
      promptId,
      versionId,
      variables,
      config: {
        model,
        temperature,
      },
    });
  }, [runMutation, workspaceSlug, promptId, versionId, variables, model, temperature]);

  const handleCopyOutput = useCallback(async () => {
    if (!response) return;
    try {
      await navigator.clipboard.writeText(response.output);
      setCopied(true);
      clipboardToast.copied("Output");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      clipboardToast.copyFailed();
    }
  }, [response]);

  // Compile preview
  const compiledPreview = useMemo(() => {
    const compile = (text: string): string => {
      return text.replace(/\{\{(\w+)\}\}/g, (match, varName: string) => {
        return varName in variables && variables[varName]
          ? variables[varName]
          : match;
      });
    };

    if (content.type === "text") {
      return compile(content.text);
    }

    return content.messages
      .map((m) => `[${m.role}]\n${compile(m.content)}`)
      .join("\n\n");
  }, [content, variables]);

  return (
    <div className="grid grid-cols-2 gap-4 h-full">
      {/* Left: Configuration */}
      <div className="flex flex-col gap-4 overflow-auto">
        {/* Variables */}
        {detectedVariables.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Variables</CardTitle>
              <CardDescription className="text-xs">
                Fill in the template variables
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {detectedVariables.map((varName) => (
                <div key={varName} className="space-y-1.5">
                  <Label htmlFor={varName} className="text-xs">
                    {varName}
                  </Label>
                  <Input
                    id={varName}
                    value={variables[varName] ?? ""}
                    onChange={(e) => handleVariableChange(varName, e.target.value)}
                    placeholder={`Enter ${varName}...`}
                    className="h-8 text-sm"
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Model Config */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Model Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Model</Label>
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AVAILABLE_MODELS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Temperature (0-2)</Label>
              <Input
                type="number"
                min={0}
                max={2}
                step={0.1}
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value) || 0)}
                className="h-8 text-sm"
              />
            </div>
          </CardContent>
        </Card>

        {/* Compiled Preview */}
        <Card className="flex-1 min-h-0">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Compiled Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-32">
              <pre className="whitespace-pre-wrap text-xs font-mono bg-muted/50 p-2 rounded">
                {compiledPreview}
              </pre>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Run Button */}
        <Button
          onClick={handleRun}
          disabled={runMutation.isPending}
          className="w-full"
        >
          {runMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Running...
            </>
          ) : (
            <>
              <Play className="mr-2 h-4 w-4" />
              Run Prompt
            </>
          )}
        </Button>
      </div>

      {/* Right: Output */}
      <div className="flex flex-col gap-4 overflow-auto">
        <Card className="flex-1 min-h-0">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm">Output</CardTitle>
                {response && (
                  <CardDescription className="text-xs mt-1">
                    {response.model} | {response.latencyMs}ms |{" "}
                    {response.totalTokens} tokens | ${response.cost.toFixed(4)}
                  </CardDescription>
                )}
              </div>
              {response && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handleCopyOutput}
                >
                  {copied ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-80">
              {response ? (
                <pre className="whitespace-pre-wrap text-sm font-mono">
                  {response.output}
                </pre>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                  Run the prompt to see output
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Metadata */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline" className="text-[10px]">
                {promptName}
              </Badge>
              <Badge variant="secondary" className="text-[10px]">
                v{version}
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                {type}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
