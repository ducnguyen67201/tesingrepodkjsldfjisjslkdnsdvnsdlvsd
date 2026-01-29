"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
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

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

type PromptType = "text" | "chat";

type PromptContent =
  | { type: "text"; text: string }
  | { type: "chat"; messages: Array<{ role: string; content: string; name?: string }> };

interface EditPromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prompt: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    tags: string[];
    latestVersionType?: "text" | "chat";
    latestVersionContent?: PromptContent;
  } | null;
  onUpdate: (data: {
    workspaceSlug: string;
    promptId: string;
    name?: string;
    slug?: string;
    description?: string | null;
    tags?: string[];
  }) => Promise<unknown>;
  onCreateVersion?: (data: {
    template: PromptContent;
  }) => Promise<unknown>;
  isUpdating: boolean;
  isCreatingVersion?: boolean;
  workspaceSlug: string;
}

export function EditPromptDialog({
  open,
  onOpenChange,
  prompt,
  onUpdate,
  onCreateVersion,
  isUpdating,
  isCreatingVersion,
  workspaceSlug,
}: EditPromptDialogProps) {
  // Metadata state
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");

  // Template state
  const [promptType, setPromptType] = useState<PromptType>("text");
  const [textContent, setTextContent] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: "system", content: "" }]);

  // Initialize form when prompt changes
  useEffect(() => {
    if (prompt) {
      setName(prompt.name);
      setSlug(prompt.slug);
      setDescription(prompt.description ?? "");
      setTags(prompt.tags.join(", "));

      // Initialize template content
      if (prompt.latestVersionContent) {
        if (prompt.latestVersionContent.type === "text") {
          setPromptType("text");
          setTextContent(prompt.latestVersionContent.text);
          setMessages([{ role: "system", content: "" }]);
        } else {
          setPromptType("chat");
          setTextContent("");
          setMessages(
            prompt.latestVersionContent.messages.map((m) => ({
              role: m.role as ChatMessage["role"],
              content: m.content,
            }))
          );
        }
      } else if (prompt.latestVersionType) {
        setPromptType(prompt.latestVersionType);
      }
    }
  }, [prompt]);

  const handleAddMessage = useCallback(() => {
    setMessages((prev) => [...prev, { role: "user", content: "" }]);
  }, []);

  const handleRemoveMessage = useCallback((index: number) => {
    setMessages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleMessageRoleChange = useCallback((index: number, value: string) => {
    setMessages((prev) =>
      prev.map((msg, i) =>
        i === index ? { ...msg, role: value as ChatMessage["role"] } : msg
      )
    );
  }, []);

  const handleMessageContentChange = useCallback((index: number, value: string) => {
    setMessages((prev) =>
      prev.map((msg, i) => (i === index ? { ...msg, content: value } : msg))
    );
  }, []);

  // Check if template has changed
  const hasTemplateChanges = useMemo(() => {
    if (!prompt?.latestVersionContent) return false;

    if (prompt.latestVersionContent.type === "text") {
      if (promptType !== "text") return true;
      return textContent !== prompt.latestVersionContent.text;
    } else {
      if (promptType !== "chat") return true;
      const originalMessages = prompt.latestVersionContent.messages;
      if (messages.length !== originalMessages.length) return true;
      return messages.some((msg, i) => {
        const orig = originalMessages[i];
        return msg.role !== orig?.role || msg.content !== orig?.content;
      });
    }
  }, [prompt, promptType, textContent, messages]);

  const handleSubmit = useCallback(async () => {
    if (!prompt) return;

    const tagList = tags
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    // Check for metadata changes
    const hasMetadataChanges =
      name !== prompt.name ||
      slug !== prompt.slug ||
      description !== (prompt.description ?? "") ||
      JSON.stringify(tagList) !== JSON.stringify(prompt.tags);

    // Update metadata if changed
    if (hasMetadataChanges) {
      await onUpdate({
        workspaceSlug,
        promptId: prompt.id,
        name: name !== prompt.name ? name : undefined,
        slug: slug !== prompt.slug ? slug : undefined,
        description: description !== (prompt.description ?? "") ? (description || null) : undefined,
        tags: JSON.stringify(tagList) !== JSON.stringify(prompt.tags) ? tagList : undefined,
      });
    }

    // Create new version if template changed
    if (hasTemplateChanges && onCreateVersion) {
      const template: PromptContent =
        promptType === "text"
          ? { type: "text", text: textContent }
          : { type: "chat", messages: messages.filter((m) => m.content.trim()) };

      await onCreateVersion({ template });
    }

    onOpenChange(false);
  }, [
    prompt,
    name,
    slug,
    description,
    tags,
    promptType,
    textContent,
    messages,
    hasTemplateChanges,
    onUpdate,
    onCreateVersion,
    workspaceSlug,
    onOpenChange,
  ]);

  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value);
  }, []);

  const handleSlugChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"));
  }, []);

  const handleDescriptionChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDescription(e.target.value);
  }, []);

  const handleTagsChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setTags(e.target.value);
  }, []);

  const handleTextContentChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setTextContent(e.target.value);
  }, []);

  const handleSelectTextType = useCallback(() => {
    setPromptType("text");
  }, []);

  const handleSelectChatType = useCallback(() => {
    setPromptType("chat");
  }, []);

  const tagList = tags
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  const hasMetadataChanges = prompt && (
    name !== prompt.name ||
    slug !== prompt.slug ||
    description !== (prompt.description ?? "") ||
    JSON.stringify(tagList) !== JSON.stringify(prompt.tags)
  );

  const hasAnyChanges = hasMetadataChanges || hasTemplateChanges;
  const isValid = name.trim().length > 0 && slug.trim().length > 0 &&
    (promptType === "text" ? textContent.trim() : messages.some((m) => m.content.trim()));
  const isPending = isUpdating || isCreatingVersion;

  if (!prompt) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl gap-0">
        <DialogHeader className="pb-4">
          <DialogTitle>Edit Prompt</DialogTitle>
          <DialogDescription>
            Update prompt metadata and content. Template changes will create a new version.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[60vh] -mx-6 px-6">
          <div className="space-y-6 pb-2">
            {/* Metadata Section */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Name</Label>
                <Input
                  id="edit-name"
                  placeholder="Prompt name"
                  value={name}
                  onChange={handleNameChange}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-slug">Slug</Label>
                <Input
                  id="edit-slug"
                  placeholder="prompt-slug"
                  value={slug}
                  onChange={handleSlugChange}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Used to fetch the prompt via SDK. Lowercase alphanumeric with hyphens.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-description">Description (optional)</Label>
                <Textarea
                  id="edit-description"
                  placeholder="A description of what this prompt does..."
                  value={description}
                  onChange={handleDescriptionChange}
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-tags">Tags (optional)</Label>
                <Input
                  id="edit-tags"
                  placeholder="tag1, tag2, tag3"
                  value={tags}
                  onChange={handleTagsChange}
                />
                <p className="text-xs text-muted-foreground">
                  Comma-separated tags for organization
                </p>
              </div>
            </div>

            {/* Template Section */}
            <div className="space-y-4 pt-4 border-t">
              <div className="space-y-2">
                <Label>Template Type</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={promptType === "text" ? "default" : "outline"}
                    size="sm"
                    onClick={handleSelectTextType}
                    className="gap-2"
                  >
                    <FileText className="h-4 w-4" />
                    Text
                  </Button>
                  <Button
                    type="button"
                    variant={promptType === "chat" ? "default" : "outline"}
                    size="sm"
                    onClick={handleSelectChatType}
                    className="gap-2"
                  >
                    <MessageSquare className="h-4 w-4" />
                    Chat
                  </Button>
                </div>
              </div>

              {promptType === "text" ? (
                <div className="space-y-2">
                  <Label htmlFor="edit-text-content">Template</Label>
                  <Textarea
                    id="edit-text-content"
                    placeholder="You are a helpful assistant. {{user_input}}"
                    value={textContent}
                    onChange={handleTextContentChange}
                    rows={6}
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
                      <ChatMessageRow
                        key={index}
                        message={msg}
                        index={index}
                        canDelete={messages.length > 1}
                        onRoleChange={handleMessageRoleChange}
                        onContentChange={handleMessageContentChange}
                        onRemove={handleRemoveMessage}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Use {"{{variable}}"} syntax for placeholders
                  </p>
                </div>
              )}

              {hasTemplateChanges && (
                <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3">
                  <p className="text-xs text-yellow-800">
                    Template changes detected. A new version will be created when you save.
                  </p>
                </div>
              )}
            </div>

            {/* Variable Preview */}
            <VariablePreview
              content={promptType === "text" ? textContent : messages.map((m) => m.content).join(" ")}
            />
          </div>
        </ScrollArea>

        <DialogFooter className="pt-4 border-t mt-4">
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending || !isValid || !hasAnyChanges}
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : hasTemplateChanges ? (
              "Save & Create Version"
            ) : (
              "Save Changes"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Single chat message row component
 */
interface ChatMessageRowProps {
  message: ChatMessage;
  index: number;
  canDelete: boolean;
  onRoleChange: (index: number, value: string) => void;
  onContentChange: (index: number, value: string) => void;
  onRemove: (index: number) => void;
}

function ChatMessageRow({
  message,
  index,
  canDelete,
  onRoleChange,
  onContentChange,
  onRemove,
}: ChatMessageRowProps) {
  const handleRoleChange = useCallback(
    (value: string) => {
      onRoleChange(index, value);
    },
    [index, onRoleChange]
  );

  const handleContentChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onContentChange(index, e.target.value);
    },
    [index, onContentChange]
  );

  const handleRemove = useCallback(() => {
    onRemove(index);
  }, [index, onRemove]);

  const placeholder =
    message.role === "system"
      ? "You are a helpful assistant..."
      : message.role === "user"
        ? "{{user_input}}"
        : "Assistant response...";

  return (
    <div className="flex gap-2">
      <Select value={message.role} onValueChange={handleRoleChange}>
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
        placeholder={placeholder}
        value={message.content}
        onChange={handleContentChange}
        rows={2}
        className="font-mono text-sm flex-1"
      />
      {canDelete && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleRemove}
          className="shrink-0"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

/**
 * Preview detected variables from template
 */
function VariablePreview({ content }: { content: string }) {
  const variables = extractVariables(content);

  if (variables.length === 0) return null;

  const renderVariableBadge = (variable: string) => (
    <Badge key={variable} variant="secondary" className="font-mono text-xs">
      {`{{${variable}}}`}
    </Badge>
  );

  return (
    <div className="rounded-lg border border-dashed p-3 bg-muted/30">
      <p className="text-xs font-medium text-muted-foreground mb-2">
        Detected Variables
      </p>
      <div className="flex flex-wrap gap-1.5">
        {variables.map(renderVariableBadge)}
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
