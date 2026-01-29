"use client";

import { useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@/lib/form";
import { Loader2, UserPlus, Globe, Check, Plus } from "lucide-react";
import { z } from "zod";
import { showError } from "@/lib/errors";
import { showSuccess } from "@/lib/success";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc/client";

// Base schema for form handling - validated more specifically in handleSubmit
const addMemberFormSchema = z.object({
  type: z.enum(["user", "domain"]),
  value: z.string().min(1, "This field is required"),
  role: z.enum(["ADMIN", "MEMBER"]),
});

// More specific validation schemas for each type
const userSchema = z.object({
  type: z.literal("user"),
  value: z.string().email("Please enter a valid email address"),
  role: z.enum(["ADMIN", "MEMBER"]),
});

const domainSchema = z.object({
  type: z.literal("domain"),
  value: z
    .string()
    .min(3, "Domain must be at least 3 characters")
    .regex(
      /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i,
      "Invalid domain format (e.g., example.com)"
    ),
  role: z.enum(["ADMIN", "MEMBER"]),
});

type AddMemberFormInput = z.infer<typeof addMemberFormSchema>;

interface AddedItem {
  type: "user" | "domain";
  value: string;
  role: string;
}

interface AddMemberDialogProps {
  workspaceId: string;
  onSuccess?: () => void;
}

export function AddMemberDialog({
  workspaceId,
  onSuccess,
}: AddMemberDialogProps) {
  const [open, setOpen] = useState(false);
  const [addedItems, setAddedItems] = useState<AddedItem[]>([]);
  const [addType, setAddType] = useState<"user" | "domain">("user");
  const utils = trpc.useUtils();

  const inviteMember = trpc.workspaces.inviteMember.useMutation({
    onSuccess: () => {
      utils.workspaces.listMembers.invalidate({ workspaceId });
    },
  });

  const createDomain = trpc.domains.create.useMutation({
    onSuccess: () => {
      utils.domains.list.invalidate({ workspaceId });
    },
  });

  const form = useForm<AddMemberFormInput>({
    resolver: zodResolver(addMemberFormSchema),
    defaultValues: {
      type: "user",
      value: "",
      role: "MEMBER",
    },
  });

  // Update form type when toggle changes
  const handleTypeChange = useCallback(
    (newType: "user" | "domain") => {
      setAddType(newType);
      form.setValue("type", newType);
      form.setValue("value", "");
      form.clearErrors();
    },
    [form]
  );

  const handleSubmit = useCallback(
    async (data: AddMemberFormInput, closeAfter: boolean) => {
      try {
        // Additional validation based on type
        if (data.type === "user") {
          const result = userSchema.safeParse(data);
          if (!result.success) {
            form.setError("value", { message: "Please enter a valid email address" });
            return;
          }
          await inviteMember.mutateAsync({
            workspaceId,
            email: data.value,
            role: data.role,
          });
          showSuccess("Member added", `${data.value} has been added to the workspace.`);
        } else {
          const result = domainSchema.safeParse(data);
          if (!result.success) {
            form.setError("value", { message: "Invalid domain format (e.g., example.com)" });
            return;
          }
          await createDomain.mutateAsync({
            workspaceId,
            domain: data.value.toLowerCase(),
            role: data.role,
          });
          showSuccess("Domain added", `Users with @${data.value.toLowerCase()} will auto-join.`);
        }

        setAddedItems((prev) => [
          ...prev,
          { type: data.type, value: data.value.toLowerCase(), role: data.role },
        ]);
        form.reset({ type: addType, value: "", role: data.role });
        onSuccess?.();

        if (closeAfter) {
          setOpen(false);
          setAddedItems([]);
        }
      } catch (error: unknown) {
        showError(error);
      }
    },
    [inviteMember, createDomain, workspaceId, form, addType, onSuccess]
  );

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!newOpen) {
        form.reset({ type: "user", value: "", role: "MEMBER" });
        setAddedItems([]);
        setAddType("user");
      }
      setOpen(newOpen);
    },
    [form]
  );

  const isPending = inviteMember.isPending || createDomain.isPending;

  const renderAddedItem = (item: AddedItem, index: number) => (
    <Badge
      key={index}
      variant="secondary"
      className="flex items-center gap-1"
    >
      <Check className="h-3 w-3 text-green-600" />
      {item.type === "domain" ? `@${item.value}` : item.value}
      <span className="text-xs text-muted-foreground">
        ({item.role})
      </span>
    </Badge>
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="mr-2 h-4 w-4" />
          Add Member
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Add Members</DialogTitle>
          <DialogDescription>
            Add users by email or set up domain auto-join for your workspace.
          </DialogDescription>
        </DialogHeader>

        {/* Recently Added Items */}
        {addedItems.length > 0 && (
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-xs font-medium text-muted-foreground mb-2">
              Added in this session:
            </p>
            <div className="flex flex-wrap gap-2">
              {addedItems.map(renderAddedItem)}
            </div>
          </div>
        )}

        <Form {...form}>
          <form className="space-y-4">
            {/* Type Toggle */}
            <div className="space-y-2">
              <Label>Add by</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={addType === "user" ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => handleTypeChange("user")}
                  disabled={isPending}
                >
                  <UserPlus className="mr-2 h-4 w-4" />
                  Email
                </Button>
                <Button
                  type="button"
                  variant={addType === "domain" ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => handleTypeChange("domain")}
                  disabled={isPending}
                >
                  <Globe className="mr-2 h-4 w-4" />
                  Domain
                </Button>
              </div>
            </div>

            {/* Value Field */}
            <FormField
              control={form.control}
              name="value"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {addType === "user" ? "Email" : "Domain"}
                  </FormLabel>
                  <FormControl>
                    {addType === "domain" ? (
                      <div className="flex items-center">
                        <span className="text-muted-foreground mr-1">@</span>
                        <Input
                          {...field}
                          placeholder="example.com"
                          disabled={isPending}
                        />
                      </div>
                    ) : (
                      <Input
                        {...field}
                        type="email"
                        placeholder="user@example.com"
                        disabled={isPending}
                      />
                    )}
                  </FormControl>
                  <FormDescription>
                    {addType === "user"
                      ? "The user must have an account to be added."
                      : "Users who sign up with this domain will auto-join."}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Role Field */}
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {addType === "user" ? "Role" : "Default Role"}
                  </FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={isPending}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a role" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="MEMBER">Member</SelectItem>
                      <SelectItem value="ADMIN">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  form.handleSubmit((data) => handleSubmit(data, false))()
                }
                disabled={isPending}
              >
                {isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}
                Add & Continue
              </Button>
              <Button
                type="button"
                onClick={() =>
                  form.handleSubmit((data) => handleSubmit(data, true))()
                }
                disabled={isPending}
              >
                {isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Add & Close
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
