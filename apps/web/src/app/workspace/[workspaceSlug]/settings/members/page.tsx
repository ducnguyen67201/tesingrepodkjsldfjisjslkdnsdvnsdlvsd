"use client";

import { useCallback } from "react";
import { useParams } from "next/navigation";
import { Loader2, MoreHorizontal, Shield, User, Crown, Trash2 } from "lucide-react";
import { WORKSPACE_ADMIN_ROLES } from "@ducsigr/api/schemas";
import { showError } from "@/lib/errors";
import { showDeleted } from "@/lib/success";
import { trpc } from "@/lib/trpc/client";
import { AddMemberDialog } from "@/components/settings/add-member-dialog";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const ROLE_ICONS = {
  OWNER: Crown,
  ADMIN: Shield,
  MEMBER: User,
} as const;

const ROLE_COLORS = {
  OWNER: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  ADMIN: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  MEMBER: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
} as const;

type WorkspaceMember = {
  id: string;
  role: string;
  createdAt: string;
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  };
};

export default function WorkspaceSettingsMembersPage() {
  const params = useParams<{ workspaceSlug: string }>();
  const utils = trpc.useUtils();
  const { confirm } = useConfirm();

  // Get workspace details
  const { data: workspace } =
    trpc.workspaces.getBySlug.useQuery(
      { workspaceSlug: params.workspaceSlug },
      { enabled: !!params.workspaceSlug }
    );

  const isAdmin = workspace ? (WORKSPACE_ADMIN_ROLES as readonly string[]).includes(workspace.role) : false;

  const {
    data: members,
    isLoading,
    error,
  } = trpc.workspaces.listMembers.useQuery(
    { workspaceId: workspace?.id ?? "" },
    { enabled: !!workspace?.id && isAdmin }
  );

  const removeMember = trpc.workspaces.removeMember.useMutation({
    onSuccess: () => {
      utils.workspaces.listMembers.invalidate({ workspaceId: workspace?.id });
      showDeleted("Member");
    },
    onError: (error) => {
      showError(error);
    },
  });

  const handleRemoveMember = useCallback(
    async (memberId: string, memberEmail: string) => {
      if (!workspace?.id) return;

      const confirmed = await confirm({
        title: "Remove member",
        message: `Are you sure you want to remove ${memberEmail} from this workspace?`,
        confirmText: "Remove",
        variant: "destructive",
      });

      if (confirmed) {
        removeMember.mutate({ workspaceId: workspace.id, memberId });
      }
    },
    [workspace?.id, confirm, removeMember]
  );

  const getInitials = (name: string | null, email: string) => {
    if (name) {
      return name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
    }
    return email.slice(0, 2).toUpperCase();
  };

  const renderMemberRow = (member: WorkspaceMember) => {
    const RoleIcon = ROLE_ICONS[member.role as keyof typeof ROLE_ICONS] ?? User;
    const roleColor = ROLE_COLORS[member.role as keyof typeof ROLE_COLORS] ?? ROLE_COLORS.MEMBER;

    return (
      <TableRow key={member.id}>
        <TableCell>
          <div className="flex items-center gap-3">
            <Avatar className="h-8 w-8">
              <AvatarImage
                src={member.user.image ?? undefined}
                alt={member.user.name ?? member.user.email}
              />
              <AvatarFallback>
                {getInitials(member.user.name, member.user.email)}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium">
                {member.user.name ?? "Unnamed"}
              </p>
              <p className="text-sm text-muted-foreground">
                {member.user.email}
              </p>
            </div>
          </div>
        </TableCell>
        <TableCell>
          <Badge variant="secondary" className={roleColor}>
            <RoleIcon className="mr-1 h-3 w-3" />
            {member.role}
          </Badge>
        </TableCell>
        <TableCell className="text-muted-foreground">
          {new Date(member.createdAt).toLocaleDateString()}
        </TableCell>
        <TableCell>
          {member.role !== "OWNER" && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() =>
                    handleRemoveMember(member.id, member.user.email)
                  }
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Remove
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </TableCell>
      </TableRow>
    );
  };

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Members</h1>
          <p className="text-sm text-muted-foreground">
            You don&apos;t have permission to manage members.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Members</h1>
          <p className="text-sm text-muted-foreground">
            Manage workspace members and their roles.
          </p>
        </div>
        {workspace?.id && <AddMemberDialog workspaceId={workspace.id} />}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Workspace Members</CardTitle>
          <CardDescription>
            {members?.length ?? 0} member{members?.length !== 1 ? "s" : ""} in
            this workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <p className="text-sm text-destructive">
              Failed to load members: {error.message}
            </p>
          ) : members && members.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map(renderMemberRow)}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No members found.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
