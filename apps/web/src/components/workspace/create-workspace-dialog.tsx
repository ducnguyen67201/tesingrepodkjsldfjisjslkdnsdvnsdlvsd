"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@/lib/form";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { CreateWorkspaceSchema, type CreateWorkspaceInput } from "@ducsigr/api/client";
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
import { trpc } from "@/lib/trpc/client";

interface CreateWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Only allow lowercase alphanumeric and hyphens (matching WorkspaceSlugSchema)
const SLUG_CHAR_REGEX = /^[a-z0-9-]*$/;

export function CreateWorkspaceDialog({
  open,
  onOpenChange,
}: CreateWorkspaceDialogProps) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const createMutation = trpc.workspaces.create.useMutation({
    onSuccess: () => {
      utils.workspaces.listWithDetails.invalidate();
    },
  });

  const form = useForm<CreateWorkspaceInput>({
    resolver: zodResolver(CreateWorkspaceSchema),
    defaultValues: {
      name: "",
      slug: "",
    },
  });

  const generateSlug = useCallback((name: string): string => {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50);
  }, []);

  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const name = e.target.value;
      form.setValue("name", name);

      // Auto-generate slug from name
      const slug = generateSlug(name);
      form.setValue("slug", slug);
    },
    [form, generateSlug]
  );

  const handleSlugChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value.toLowerCase();
      if (SLUG_CHAR_REGEX.test(value)) {
        form.setValue("slug", value);
      }
    },
    [form]
  );

  const handleSlugBlur = useCallback(() => {
    // Strip leading/trailing hyphens on blur to match WorkspaceSlugSchema
    const rawSlug = form.getValues("slug");
    const slug = rawSlug.replace(/^-+|-+$/g, "");
    if (slug !== rawSlug) {
      form.setValue("slug", slug);
    }
  }, [form]);

  const handleSubmit = useCallback(
    async (data: CreateWorkspaceInput) => {
      setIsSubmitting(true);
      try {
        const workspace = await createMutation.mutateAsync(data);
        toast.success("Workspace created", {
          description: `${workspace.name} has been created successfully.`,
        });
        onOpenChange(false);
        form.reset();
        // Navigate to the new workspace
        router.push(`/workspace/${workspace.slug}`);
      } catch (error) {
        // Handle slug conflict (P2002 unique constraint)
        const message =
          error instanceof Error ? error.message : "Failed to create workspace";
        if (message.includes("slug is already taken")) {
          toast.error("Slug unavailable", {
            description: "This workspace URL is already taken. Please try a different one.",
          });
        } else {
          toast.error("Error", { description: message });
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [createMutation, onOpenChange, form, router]
  );

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!newOpen) {
        form.reset();
      }
      onOpenChange(newOpen);
    },
    [form, onOpenChange]
  );

  const handleCancel = useCallback(() => {
    handleOpenChange(false);
  }, [handleOpenChange]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create Workspace</DialogTitle>
          <DialogDescription>
            Create a new workspace to organize your projects and collaborate
            with your team.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="My Workspace"
                      onChange={handleNameChange}
                      disabled={isSubmitting}
                    />
                  </FormControl>
                  <FormDescription>
                    The display name for your workspace.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="slug"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>URL Slug</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="my-workspace"
                      onChange={handleSlugChange}
                      onBlur={handleSlugBlur}
                      disabled={isSubmitting}
                    />
                  </FormControl>
                  <FormDescription>
                    Used in URLs: /workspace/{form.watch("slug") || "slug"}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
              >
                {isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Create Workspace
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
