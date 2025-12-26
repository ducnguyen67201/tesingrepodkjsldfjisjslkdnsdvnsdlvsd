"use client";

import { useCallback } from "react";
import { useForm } from "react-hook-form";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useDashboards } from "@/hooks/use-dashboards";
import type { DashboardVisibility } from "@ducsigr/api/schemas";

// ============================================================
// Types
// ============================================================

interface CreateDashboardDialogProps {
  workspaceSlug: string;
  projectId?: string;
  open: boolean;
  onClose: () => void;
  onCreated?: (dashboardId: string) => void;
}

interface FormValues {
  name: string;
  description: string;
  visibility: DashboardVisibility;
  isDefault: boolean;
}

const DEFAULT_VALUES: FormValues = {
  name: "",
  description: "",
  visibility: "workspace",
  isDefault: false,
};

// ============================================================
// Component
// ============================================================

export function CreateDashboardDialog({
  workspaceSlug,
  projectId,
  open,
  onClose,
  onCreated,
}: CreateDashboardDialogProps) {
  const { createDashboard, isCreating } = useDashboards(workspaceSlug, projectId);

  const form = useForm<FormValues>({
    defaultValues: DEFAULT_VALUES,
  });

  const handleSubmit = useCallback(
    async (values: FormValues) => {
      const result = await createDashboard({
        name: values.name,
        description: values.description || undefined,
        projectId,
        visibility: values.visibility,
        isDefault: values.isDefault,
      });
      form.reset();
      onClose();
      onCreated?.(result.id);
    },
    [createDashboard, projectId, form, onClose, onCreated]
  );

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        form.reset();
        onClose();
      }
    },
    [form, onClose]
  );

  const handleFormSubmit = form.handleSubmit(handleSubmit);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create Dashboard</DialogTitle>
          <DialogDescription>
            Create a new dashboard to organize your observability widgets.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={handleFormSubmit} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              rules={{ required: "Name is required" }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="My Dashboard" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Optional description..."
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="visibility"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Visibility</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select visibility" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="workspace">Workspace</SelectItem>
                      <SelectItem value="personal">Personal</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Workspace dashboards are visible to all members.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="isDefault"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>Default Dashboard</FormLabel>
                    <FormDescription>
                      Show this dashboard by default for the project.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isCreating}>
                {isCreating ? "Creating..." : "Create Dashboard"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
