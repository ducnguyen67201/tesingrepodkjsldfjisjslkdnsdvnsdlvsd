import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import Link from "next/link";
import { Lock, Plus, Mail } from "lucide-react";
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
 * - If approved: Can create their own workspace
 * - If not approved: Must contact admin for access
 */
export default async function NoWorkspacePage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/login");
  }

  // Get user with approval status and check workspace membership
  const [user, membership] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { isApproved: true },
    }),
    prisma.workspaceMember.findFirst({
      where: { userId: session.user.id },
      include: {
        workspace: { select: { slug: true } },
      },
    }),
  ]);

  // If user has a workspace, redirect them there
  if (membership) {
    redirect(`/workspace/${membership.workspace.slug}`);
  }

  const isApproved = user?.isApproved ?? false;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Lock className="h-6 w-6 text-muted-foreground" />
          </div>
          <CardTitle>
            {isApproved ? "No Workspace Access" : "Account Pending Approval"}
          </CardTitle>
          <CardDescription>
            {isApproved
              ? "You don't have access to any workspace yet."
              : "Your account is awaiting administrator approval."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {isApproved ? (
            <>
              <div className="rounded-lg bg-muted/50 p-4 text-center text-sm text-muted-foreground">
                <p>
                  Please wait for a workspace admin to add you, or create your
                  own workspace to get started.
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
            </>
          ) : (
            <>
              <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-4 text-center text-sm text-amber-600 dark:text-amber-400">
                <Mail className="mx-auto mb-2 h-5 w-5" />
                <p>
                  Please contact the system administrator to request access to
                  the platform.
                </p>
              </div>

              <div className="flex flex-col gap-3">
                <LogoutButton className="w-full" />
              </div>
            </>
          )}

          <div className="text-center text-xs text-muted-foreground">
            Signed in as{" "}
            <span className="font-medium">{session.user.email}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
