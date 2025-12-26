"use client";

import { useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@/lib/form";
import {
  Loader2,
  Plus,
  Globe,
  Trash2,
  Shield,
  User,
} from "lucide-react";
import { z } from "zod";
import { WORKSPACE_ADMIN_ROLES } from "@ducsigr/api/schemas";
import { showError } from "@/lib/errors";
import { showSuccess, showDeleted } from "@/lib/success";
import { trpc } from "@/lib/trpc/client";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const addDomainSchema = z.object({
  domain: z
    .string()
    .min(3, "Domain must be at least 3 characters")
    .max(255)
    .regex(
      /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i,
      "Invalid domain format (e.g., example.com)"
    ),
  role: z.enum(["ADMIN", "MEMBER"]),
});

type AddDomainInput = z.infer<typeof addDomainSchema>;

const ROLE_ICONS = {
  ADMIN: Shield,
  MEMBER: User,
} as const;

const ROLE_COLORS = {
  ADMIN: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  MEMBER: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
} as const;

type AllowedDomain = {
  id: string;
  domain: string;
  role: string;
  createdAt: string;
  createdBy: {
    id: string;
    name: string | null;
    email: string;
  };
};

export default function WorkspaceSettingsDomainsPage() {
  const params = useParams<{ workspaceSlug: string }>();
  const [dialogOpen, setDialogOpen] = useState(false);
  const utils = trpc.useUtils();
  const { confirm } = useConfirm();

  // Get workspace details
  const { data: workspace } = trpc.workspaces.getBySlug.useQuery(
    { workspaceSlug: params.workspaceSlug },
    { enabled: !!params.workspaceSlug }
  );

  const isAdmin = workspace ? (WORKSPACE_ADMIN_ROLES as readonly string[]).includes(workspace.role) : false;

  const {
    data: domains,
    isLoading,
    error,
  } = trpc.domains.list.useQuery(
    { workspaceId: workspace?.id ?? "" },
    { enabled: !!workspace?.id && isAdmin }
  );

  const createDomain = trpc.domains.create.useMutation({
    onSuccess: () => {
      utils.domains.list.invalidate({ workspaceId: workspace?.id });
    },
  });

  const deleteDomain = trpc.domains.delete.useMutation({
    onSuccess: () => {
      utils.domains.list.invalidate({ workspaceId: workspace?.id });
      showDeleted("Domain");
    },
    onError: (error) => {
      showError(error);
    },
  });

  const form = useForm({
    resolver: zodResolver(addDomainSchema),
    defaultValues: {
      domain: "",
      role: "MEMBER" as const,
    },
  });

  const handleSubmit = useCallback(
    async (data: AddDomainInput) => {
      if (!workspace?.id) return;

      try {
        await createDomain.mutateAsync({
          workspaceId: workspace.id,
          domain: data.domain.toLowerCase(),
          role: data.role,
        });
        showSuccess(
          "Domain added",
          `Users with @${data.domain.toLowerCase()} will automatically join this workspace.`
        );
        setDialogOpen(false);
        form.reset();
      } catch (error) {
        showError(error);
      }
    },
    [createDomain, workspace?.id, form]
  );

  const handleDelete = useCallback(
    async (domainId: string, domain: string) => {
      if (!workspace?.id) return;

      const confirmed = await confirm({
        title: "Remove domain",
        message: `Are you sure you want to remove "@${domain}"? New users with this domain will no longer auto-join.`,
        confirmText: "Remove",
        variant: "destructive",
      });

      if (confirmed) {
        deleteDomain.mutate({ workspaceId: workspace.id, domainId });
      }
    },
    [workspace?.id, confirm, deleteDomain]
  );

  const handleDialogChange = useCallback(
    (open: boolean) => {
      if (!open) {
        form.reset();
      }
      setDialogOpen(open);
    },
    [form]
  );

  const renderDomainRow = (domain: AllowedDomain) => {
    const RoleIcon =
      ROLE_ICONS[domain.role as keyof typeof ROLE_ICONS] ?? User;
    const roleColor =
      ROLE_COLORS[domain.role as keyof typeof ROLE_COLORS] ??
      ROLE_COLORS.MEMBER;

    return (
      <TableRow key={domain.id}>
        <TableCell>
          <div className="flex items-center gap-2">
            <Avatar className="h-8 w-8">
              <AvatarFallback>
                <Globe className="h-4 w-4" />
              </AvatarFallback>
            </Avatar>
            <span className="font-medium">@{domain.domain}</span>
          </div>
        </TableCell>
        <TableCell>
          <Badge variant="secondary" className={roleColor}>
            <RoleIcon className="mr-1 h-3 w-3" />
            {domain.role}
          </Badge>
        </TableCell>
        <TableCell className="text-muted-foreground">
          {domain.createdBy.name ?? domain.createdBy.email}
        </TableCell>
        <TableCell className="text-muted-foreground">
          {new Date(domain.createdAt).toLocaleDateString()}
        </TableCell>
        <TableCell>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleDelete(domain.id, domain.domain)}
            disabled={deleteDomain.isPending}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </TableCell>
      </TableRow>
    );
  };

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Domain Matcher</h1>
          <p className="text-sm text-muted-foreground">
            You don&apos;t have permission to manage domain settings.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Domain Matcher</h1>
          <p className="text-sm text-muted-foreground">
            Auto-add users to this workspace based on their email domain.
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={handleDialogChange}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Domain
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Add Domain</DialogTitle>
              <DialogDescription>
                Users who sign up with this email domain will automatically be
                added to this workspace.
              </DialogDescription>
            </DialogHeader>

            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(handleSubmit)}
                className="space-y-4"
              >
                <FormField
                  control={form.control}
                  name="domain"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Domain</FormLabel>
                      <FormControl>
                        <div className="flex items-center">
                          <span className="text-muted-foreground mr-1">@</span>
                          <Input
                            {...field}
                            placeholder="example.com"
                            disabled={createDomain.isPending}
                          />
                        </div>
                      </FormControl>
                      <FormDescription>
                        Enter the email domain without the @ symbol.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Default Role</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        disabled={createDomain.isPending}
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
                      <FormDescription>
                        The role assigned to users who auto-join via this
                        domain.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleDialogChange(false)}
                    disabled={createDomain.isPending}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createDomain.isPending}>
                    {createDomain.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Add Domain
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Allowed Domains</CardTitle>
          <CardDescription>
            Users signing up with these email domains will automatically be
            added to this workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <p className="text-sm text-destructive">
              Failed to load domains: {error.message}
            </p>
          ) : domains && domains.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Domain</TableHead>
                  <TableHead>Default Role</TableHead>
                  <TableHead>Added By</TableHead>
                  <TableHead>Added</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {domains.map(renderDomainRow)}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8">
              <Globe className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-sm text-muted-foreground">
                No domains configured yet.
              </p>
              <p className="text-sm text-muted-foreground">
                Add a domain to enable auto-join for users with that email
                domain.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
