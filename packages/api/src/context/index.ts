import type { Session } from "next-auth";

/**
 * Context passed to all tRPC procedures.
 * Contains session info and any other request-specific data.
 */
export interface Context {
  session: Session | null;
}

/**
 * Project access from session
 */
export interface ProjectAccess {
  id: string;
  role: string;
}

/**
 * Workspace access from session
 */
export interface WorkspaceAccess {
  id: string;
  slug: string;
  role: string;
  isPersonal: boolean;
}

/**
 * Extended session with project access
 */
export interface SessionWithProjects extends Session {
  user: Session["user"] & {
    id: string;
    projects: ProjectAccess[];
  };
}

/**
 * Extended session with workspace and project access
 */
export interface SessionWithWorkspaces extends Session {
  user: Session["user"] & {
    id: string;
    workspaces: WorkspaceAccess[];
    projects: ProjectAccess[];
  };
}

/**
 * Context with resolved workspace (after workspace middleware)
 */
export interface WorkspaceContext extends Context {
  session: SessionWithWorkspaces;
  workspace: {
    id: string;
    slug: string;
    role: string;
  };
}
