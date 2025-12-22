"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc/client";
import { knowledgeToast } from "@/lib/success";
import { showError } from "@/lib/errors";

const articleFormSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  slug: z
    .string()
    .min(1, "Slug is required")
    .max(100)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Slug must be lowercase with hyphens only"
    ),
  summary: z.string().max(500).optional(),
  content: z.string().min(1, "Content is required"),
  tags: z.string().optional(),
});

type ArticleFormData = z.infer<typeof articleFormSchema>;

/** Article data for edit mode */
interface ArticleForEdit {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  content: string;
  tags: string[];
}

interface ArticleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceSlug: string;
  groupId?: string;
  /** Article to edit (if provided, dialog is in edit mode) */
  article?: ArticleForEdit | null;
}

export function ArticleDialog({
  open,
  onOpenChange,
  workspaceSlug,
  groupId,
  article,
}: ArticleDialogProps) {
  const utils = trpc.useUtils();
  const isEditMode = !!article;

  const defaultValues = useMemo(
    () =>
      article
        ? {
            title: article.title,
            slug: article.slug,
            summary: article.summary ?? "",
            content: article.content,
            tags: article.tags.join(", "),
          }
        : {
            title: "",
            slug: "",
            summary: "",
            content: "",
            tags: "",
          },
    [article]
  );

  const form = useForm<ArticleFormData>({
    resolver: zodResolver(articleFormSchema),
    defaultValues,
  });

  // Reset form when article changes or dialog opens
  useEffect(() => {
    if (open) {
      form.reset(defaultValues);
    }
  }, [open, defaultValues, form]);

  const createArticle = trpc.knowledge.createArticle.useMutation({
    onSuccess: (result) => {
      knowledgeToast.articleCreated(result.title);
      utils.knowledge.listArticles.invalidate();
      onOpenChange(false);
      form.reset();
    },
    onError: showError,
  });

  const updateArticle = trpc.knowledge.updateArticle.useMutation({
    onSuccess: (result) => {
      knowledgeToast.articleUpdated(result.title);
      utils.knowledge.listArticles.invalidate();
      utils.knowledge.getArticle.invalidate({
        workspaceSlug,
        articleId: article?.id,
      });
      onOpenChange(false);
    },
    onError: showError,
  });

  const handleSubmit = useCallback(
    (data: ArticleFormData) => {
      const tags = data.tags
        ? data.tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : [];

      if (isEditMode && article) {
        updateArticle.mutate({
          workspaceSlug,
          articleId: article.id,
          title: data.title,
          slug: data.slug,
          summary: data.summary || undefined,
          content: data.content,
          tags,
        });
      } else {
        createArticle.mutate({
          workspaceSlug,
          groupId: groupId || undefined,
          title: data.title,
          slug: data.slug,
          summary: data.summary || undefined,
          content: data.content,
          tags,
        });
      }
    },
    [createArticle, updateArticle, workspaceSlug, groupId, isEditMode, article]
  );

  const handleTitleChange = useCallback(
    (title: string) => {
      form.setValue("title", title);
      // Auto-generate slug from title only in create mode and if slug hasn't been manually edited
      if (
        !isEditMode &&
        (!form.getValues("slug") || form.formState.dirtyFields.slug === false)
      ) {
        const slug = title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");
        form.setValue("slug", slug);
      }
    },
    [form, isEditMode]
  );

  const isPending = createArticle.isPending || updateArticle.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEditMode ? "Edit Article" : "Create New Article"}
          </DialogTitle>
          <DialogDescription>
            {isEditMode
              ? "Update the article content and metadata."
              : "Create a new knowledge base article. Articles can contain markdown content."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Article title"
                      {...field}
                      onChange={(e) => handleTitleChange(e.target.value)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="slug"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Slug</FormLabel>
                  <FormControl>
                    <Input placeholder="article-slug" {...field} />
                  </FormControl>
                  <FormDescription>
                    URL-friendly identifier.{" "}
                    {!isEditMode && "Auto-generated from title."}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="summary"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Summary (optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Brief summary of the article"
                      className="h-20"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="content"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Content</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Article content (supports markdown)"
                      className="h-40 font-mono text-sm"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="tags"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tags (optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="tag1, tag2, tag3" {...field} />
                  </FormControl>
                  <FormDescription>Comma-separated list of tags</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditMode ? "Save Changes" : "Create Article"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// Re-export with old name for backwards compatibility
export { ArticleDialog as CreateArticleDialog };
