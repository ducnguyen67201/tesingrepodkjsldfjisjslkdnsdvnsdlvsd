"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@/lib/form";
import { Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import {
  CreateWorkspaceSchema,
  type CreateWorkspaceInput,
} from "@ducsigr/api/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

const SLUG_CHAR_REGEX = /^[a-z0-9-]*$/;

export default function CreateWorkspacePage() {
  const router = useRouter();
  const { status } = useSession();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const createMutation = trpc.workspaces.create.useMutation();

  const form = useForm<CreateWorkspaceInput>({
    resolver: zodResolver(CreateWorkspaceSchema),
    defaultValues: {
      name: "",
      slug: "",
    },
  });

  // Redirect unauthenticated users
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  const generateSlug = (name: string): string => {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50);
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    form.setValue("name", name);
    const slug = generateSlug(name);
    form.setValue("slug", slug);
  };

  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toLowerCase();
    if (SLUG_CHAR_REGEX.test(value)) {
      form.setValue("slug", value);
    }
  };

  const handleSlugBlur = () => {
    const rawSlug = form.getValues("slug");
    const slug = rawSlug.replace(/^-+|-+$/g, "");
    if (slug !== rawSlug) {
      form.setValue("slug", slug);
    }
  };

  const handleSubmit = async (data: CreateWorkspaceInput) => {
    setIsSubmitting(true);
    try {
      const workspace = await createMutation.mutateAsync(data);
      toast.success("Workspace created", {
        description: `${workspace.name} has been created successfully.`,
      });
      router.push(`/workspace/${workspace.slug}`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create workspace";
      if (message.includes("slug is already taken")) {
        toast.error("Slug unavailable", {
          description:
            "This workspace URL is already taken. Please try a different one.",
        });
      } else {
        toast.error("Error", { description: message });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/no-workspace">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Link>
            </Button>
          </div>
          <CardTitle>Create Workspace</CardTitle>
          <CardDescription>
            Create a new workspace to organize your projects and collaborate
            with your team.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(handleSubmit)}
              className="space-y-4"
            >
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

              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => router.push("/no-workspace")}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" className="flex-1" disabled={isSubmitting}>
                  {isSubmitting && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Create Workspace
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
