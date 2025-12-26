import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import Link from "next/link";
import { Lock, Plus } from "lucide-react";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@ducsigr/db";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LogoutButton } from "@/components/logout-button";

/**
 * No Workspace Page
 * Shown to authenticated users who don't have access to any workspace.
 * They must wait for an admin to add them, or create their own workspace.
 */
export default async function NoWorkspacePage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/login");
  }

  // Double-check if user actually has no workspace
  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: session.user.id },
    include: {
      workspace: { select: { slug: true } },
    },
  });

  // If user has a workspace, redirect them there
  if (membership) {
    redirect(`/workspace/${membership.workspace.slug}`);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Lock className="h-6 w-6 text-muted-foreground" />
          </div>
          <CardTitle>No Workspace Access</CardTitle>
          <CardDescription>
            You don&apos;t have access to any workspace yet.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-lg bg-muted/50 p-4 text-center text-sm text-muted-foreground">
            <p>
              Please wait for a workspace admin to add you, or create your own
              workspace to get started.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <Button asChild className="w-full">
              <Link href="/workspace/create">
                <Plus className="mr-2 h-4 w-4" />
                Create Workspace
              </Link>
            </Button>
            <LogoutButton className="w-full" />
          </div>

          <div className="text-center text-xs text-muted-foreground">
            Signed in as{" "}
            <span className="font-medium">{session.user.email}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
