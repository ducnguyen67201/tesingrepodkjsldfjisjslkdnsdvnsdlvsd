"use client";

import { useState, useCallback, useMemo } from "react";
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
import { trpc } from "@/lib/trpc/client";
import { showError } from "@/lib/errors";
import { showSuccess } from "@/lib/success";

interface CreatePromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceSlug: string;
  projectId: string;
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

type PromptType = "text" | "chat";

const INITIAL_MESSAGES: ChatMessage[] = [
  { role: "system", content: "" },
];

export function CreatePromptDialog({
  open,
  onOpenChange,
  workspaceSlug,
  projectId,
}: CreatePromptDialogProps) {
  const utils = trpc.useUtils();

  // Form state
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [promptType, setPromptType] = useState<PromptType>("text");
  const [textContent, setTextContent] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);

  // Create mutation
  const createPrompt = trpc.prompts.create.useMutation({
    onSuccess: (newPrompt) => {
      showSuccess("Prompt created", `"${newPrompt.name}" is ready.`);
      utils.prompts.list.invalidate({ workspaceSlug, projectId });
      handleClose();
    },
    onError: showError,
  });

  const generateSlug = useCallback((value: string) => {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50);
  }, []);

  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setName(value);
      // Auto-generate slug if user hasn't manually edited it
      if (!slug || slug === generateSlug(name)) {
        setSlug(generateSlug(value));
      }
    },
    [name, slug, generateSlug]
  );

  const handleAddMessage = useCallback(() => {
    setMessages((prev) => [...prev, { role: "user", content: "" }]);
  }, []);

  const handleRemoveMessage = useCallback((index: number) => {
    setMessages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleMessageRoleChange = useCallback(
    (index: number, value: string) => {
      setMessages((prev) =>
        prev.map((msg, i) =>
          i === index ? { ...msg, role: value as ChatMessage["role"] } : msg
        )
      );
    },
    []
  );

  const handleMessageContentChange = useCallback(
    (index: number, value: string) => {
      setMessages((prev) =>
        prev.map((msg, i) =>
          i === index ? { ...msg, content: value } : msg
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

    const tagList = tags
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    await createPrompt.mutateAsync({
      workspaceSlug,
      projectId,
      name,
      slug,
      description: description || undefined,
      tags: tagList,
      template,
    });
  }, [
    createPrompt,
    workspaceSlug,
    projectId,
    name,
    slug,
    description,
    tags,
    promptType,
    textContent,
    messages,
  ]);

  const handleClose = useCallback(() => {
    setName("");
    setSlug("");
    setDescription("");
    setTags("");
    setPromptType("text");
    setTextContent("");
    setMessages(INITIAL_MESSAGES);
    onOpenChange(false);
  }, [onOpenChange]);

  const handleSlugChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSlug(e.target.value);
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

  // Memoize messages content for VariablePreview
  const messagesContent = useMemo(
    () => messages.map((m) => m.content).join(" "),
    [messages]
  );

  const isValid = name.trim() && slug.trim() &&
    (promptType === "text" ? textContent.trim() : messages.some((m) => m.content.trim()));

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl gap-0">
        <DialogHeader className="pb-4">
          <DialogTitle>Create Prompt</DialogTitle>
          <DialogDescription>
            Create a new prompt template that can be retrieved via SDK.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[60vh] -mx-6 px-6">
          <div className="space-y-6 pb-2">
            {/* Basic Info */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  placeholder="Movie Critic Prompt"
                  value={name}
                  onChange={handleNameChange}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="slug">Slug</Label>
                <Input
                  id="slug"
                  placeholder="movie-critic-prompt"
                  value={slug}
                  onChange={handleSlugChange}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Use this slug to fetch the prompt via SDK
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description (optional)</Label>
                <Textarea
                  id="description"
                  placeholder="A prompt for generating movie reviews..."
                  value={description}
                  onChange={handleDescriptionChange}
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="tags">Tags (optional)</Label>
                <Input
                  id="tags"
                  placeholder="movie, review, critic"
                  value={tags}
                  onChange={handleTagsChange}
                />
                <p className="text-xs text-muted-foreground">
                  Comma-separated tags for organization
                </p>
              </div>
            </div>

            {/* Template Type */}
            <div className="space-y-4">
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

              {/* Template Content */}
              {promptType === "text" ? (
                <div className="space-y-2">
                  <Label htmlFor="text-content">Template</Label>
                  <Textarea
                    id="text-content"
                    placeholder="You are a movie critic. Write a review for {{movie}}..."
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
            </div>

            {/* Variable Preview */}
            <VariablePreview
              content={promptType === "text" ? textContent : messagesContent}
            />
          </div>
        </ScrollArea>

        <DialogFooter className="pt-4 border-t mt-4">
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={createPrompt.isPending || !isValid}
          >
            {createPrompt.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Prompt"
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
