"use client";

import { useState, useCallback } from "react";
import { Loader2, Plus, Trash2, MessageSquare, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface CreateVersionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  promptName: string;
  currentVersion: number;
  currentType: "text" | "chat";
  currentContent:
    | { type: "text"; text: string }
    | { type: "chat"; messages: Array<{ role: string; content: string; name?: string }> };
  onCreateVersion: (data: {
    template: { type: "text"; text: string } | { type: "chat"; messages: ChatMessage[] };
  }) => Promise<unknown>;
  isCreating: boolean;
}

export function CreateVersionDialog({
  open,
  onOpenChange,
  promptName,
  currentVersion,
  currentType,
  currentContent,
  onCreateVersion,
  isCreating,
}: CreateVersionDialogProps) {
  // Initialize with current content (filter to only supported roles)
  const initializeMessages = (): ChatMessage[] => {
    if (currentContent.type !== "chat") {
      return [{ role: "system", content: "" }];
    }
    // Filter to only supported roles and map to ChatMessage type
    const validRoles = ["system", "user", "assistant"] as const;
    const filtered = currentContent.messages
      .filter((m) => validRoles.includes(m.role as typeof validRoles[number]))
      .map((m) => ({
        role: m.role as "system" | "user" | "assistant",
        content: m.content,
      }));
    return filtered.length > 0 ? filtered : [{ role: "system", content: "" }];
  };

  const [promptType, setPromptType] = useState<"text" | "chat">(currentType);
  const [textContent, setTextContent] = useState(
    currentContent.type === "text" ? currentContent.text : ""
  );
  const [messages, setMessages] = useState<ChatMessage[]>(initializeMessages);

  const handleAddMessage = useCallback(() => {
    setMessages((prev) => [...prev, { role: "user", content: "" }]);
  }, []);

  const handleRemoveMessage = useCallback((index: number) => {
    setMessages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleMessageChange = useCallback(
    (index: number, field: keyof ChatMessage, value: string) => {
      setMessages((prev) =>
        prev.map((msg, i) =>
          i === index ? { ...msg, [field]: value } : msg
        )
      );
    },
    []
  );

  const handleSubmit = useCallback(async () => {
    const template =
      promptType === "text"
        ? { type: "text" as const, text: textContent }
        : { type: "chat" as const, messages: messages.filter((m) => m.content.trim()) };

    await onCreateVersion({ template });
    onOpenChange(false);
  }, [promptType, textContent, messages, onCreateVersion, onOpenChange]);

  const isValid =
    promptType === "text"
      ? textContent.trim().length > 0
      : messages.some((m) => m.content.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0">
        <DialogHeader className="pb-4">
          <DialogTitle>Create New Version</DialogTitle>
          <DialogDescription>
            Create version {currentVersion + 1} for &quot;{promptName}&quot;
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[50vh] -mx-6 px-6">
          <div className="space-y-6 pb-2">
            {/* Template Type */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Template Type</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={promptType === "text" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setPromptType("text")}
                    className="gap-2"
                  >
                    <FileText className="h-4 w-4" />
                    Text
                  </Button>
                  <Button
                    type="button"
                    variant={promptType === "chat" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setPromptType("chat")}
                    className="gap-2"
                  >
                    <MessageSquare className="h-4 w-4" />
                    Chat
                  </Button>
                </div>
              </div>

              {/* Template Content */}
              {promptType === "text" ? (
                <div className="space-y-2">
                  <Label htmlFor="text-content">Template</Label>
                  <Textarea
                    id="text-content"
                    placeholder="Enter your prompt template..."
                    value={textContent}
                    onChange={(e) => setTextContent(e.target.value)}
                    rows={10}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Use {"{{variable}}"} syntax for placeholders
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Messages</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAddMessage}
                    >
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                      Add Message
                    </Button>
                  </div>

                  <div className="space-y-3">
                    {messages.map((msg, index) => (
                      <div key={index} className="flex gap-2">
                        <Select
                          value={msg.role}
                          onValueChange={(value) =>
                            handleMessageChange(index, "role", value)
                          }
                        >
                          <SelectTrigger className="w-28 shrink-0">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="system">System</SelectItem>
                            <SelectItem value="user">User</SelectItem>
                            <SelectItem value="assistant">Assistant</SelectItem>
                          </SelectContent>
                        </Select>
                        <Textarea
                          placeholder={
                            msg.role === "system"
                              ? "You are a helpful assistant..."
                              : msg.role === "user"
                              ? "{{user_input}}"
                              : "Assistant response..."
                          }
                          value={msg.content}
                          onChange={(e) =>
                            handleMessageChange(index, "content", e.target.value)
                          }
                          rows={2}
                          className="font-mono text-sm flex-1"
                        />
                        {messages.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveMessage(index)}
                            className="shrink-0"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Use {"{{variable}}"} syntax for placeholders
                  </p>
                </div>
              )}
            </div>

            {/* Variable Preview */}
            <VariablePreview
              content={
                promptType === "text"
                  ? textContent
                  : messages.map((m) => m.content).join(" ")
              }
            />
          </div>
        </ScrollArea>

        <DialogFooter className="pt-4 border-t mt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isCreating || !isValid}>
            {isCreating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              `Create v${currentVersion + 1}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Preview detected variables from template
 */
function VariablePreview({ content }: { content: string }) {
  const variables = extractVariables(content);

  if (variables.length === 0) return null;

  return (
    <div className="rounded-lg border border-dashed p-3 bg-muted/30">
      <p className="text-xs font-medium text-muted-foreground mb-2">
        Detected Variables
      </p>
      <div className="flex flex-wrap gap-1.5">
        {variables.map((v) => (
          <Badge key={v} variant="secondary" className="font-mono text-xs">
            {`{{${v}}}`}
          </Badge>
        ))}
      </div>
    </div>
  );
}

/**
 * Extract variable names from template content
 */
function extractVariables(content: string): string[] {
  const regex = /\{\{(\w+)\}\}/g;
  const variables = new Set<string>();
  let match;
  while ((match = regex.exec(content)) !== null) {
    if (match[1]) {
      variables.add(match[1]);
    }
  }
  return Array.from(variables);
}
