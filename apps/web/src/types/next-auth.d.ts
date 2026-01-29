import "next-auth";
import "next-auth/jwt";

/**
 * Workspace access stored in session
 */
interface WorkspaceAccess {
  id: string;
  name: string;
  slug: string;
  role: string;
  isPersonal: boolean;
}

/**
 * Project access stored in session
 */
interface ProjectAccess {
  id: string;
  role: string;
}

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      workspaces: WorkspaceAccess[];
      projects: ProjectAccess[];
    };
  }

  interface User {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    workspaces: WorkspaceAccess[];
    projects: ProjectAccess[];
  }
}
