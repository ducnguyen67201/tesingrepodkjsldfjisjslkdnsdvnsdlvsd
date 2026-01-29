import { NextAuthOptions } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter } from "next-auth/adapters";
import { prisma } from "@ducsigr/db";
import { extractDomainFromEmail } from "@ducsigr/api";
import { providers } from "./providers";
import { env } from "../env";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as Adapter,

  providers,

  session: {
    strategy: "jwt",
    maxAge: 7 * 24 * 60 * 60, // 7 days
  },

  pages: {
    signIn: "/login",
    signOut: "/login",
    error: "/login",
    newUser: "/", // Redirect to home, which will redirect to default workspace
  },

  callbacks: {
    async jwt({ token, user }) {
      // Initial sign in
      if (user) {
        token.id = user.id;
        token.email = user.email;
      }

      // Add workspace and project access to token (for API authorization)
      if (token.id) {
        // Fetch workspace memberships
        const workspaceMemberships = await prisma.workspaceMember.findMany({
          where: { userId: token.id as string },
          include: {
            workspace: {
              select: { id: true, name: true, slug: true, isPersonal: true },
            },
          },
        });

        token.workspaces = workspaceMemberships.map((m) => ({
          id: m.workspace.id,
          name: m.workspace.name,
          slug: m.workspace.slug,
          role: m.role,
          isPersonal: m.workspace.isPersonal,
        }));

        // Fetch project memberships
        const projectMemberships = await prisma.projectMember.findMany({
          where: { userId: token.id as string },
          select: { projectId: true, role: true },
        });

        token.projects = projectMemberships.map((m) => ({
          id: m.projectId,
          role: m.role,
        }));
      }

      return token;
    },

    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.workspaces = token.workspaces as Array<{
          id: string;
          name: string;
          slug: string;
          role: string;
          isPersonal: boolean;
        }>;
        session.user.projects = token.projects as Array<{
          id: string;
          role: string;
        }>;
      }
      return session;
    },
  },

  events: {
    async signIn({ user, isNewUser }) {
      if (isNewUser && user.id && user.email) {
        // Domain Matcher: Check if user's email domain matches any workspace
        const domain = extractDomainFromEmail(user.email);

        if (domain) {
          const allowedDomain = await prisma.allowedDomain.findUnique({
            where: { domain },
          });

          if (allowedDomain) {
            // Auto-add user to workspace based on domain match
            try {
              await prisma.workspaceMember.create({
                data: {
                  userId: user.id,
                  workspaceId: allowedDomain.workspaceId,
                  role: allowedDomain.role,
                },
              });
              console.info("Domain matcher: Auto-added user to workspace", {
                userId: user.id,
                email: user.email,
                domain,
                workspaceId: allowedDomain.workspaceId,
              });
            } catch (error) {
              // P2002 = user already a member (edge case)
              const isPrismaError = error instanceof Error && "code" in error;
              if (!isPrismaError || (error as { code: string }).code !== "P2002") {
                throw error;
              }
            }
          }
          // If no domain match, user has no workspace - they'll see the no-workspace page
        }
      }
    },
  },

  debug: env.NODE_ENV === "development",
};
