# Workspace Architecture

This document describes the workspace-based multi-tenancy architecture in Ducsigr.

## Data Model

```
User
  └── WorkspaceMember (role: OWNER | ADMIN | MEMBER)
        └── Workspace
              └── Project
                    ├── ApiKey
                    └── Trace
                          └── Span
```

### Key Relationships

| Entity | Relationship | Description |
|--------|--------------|-------------|
| User → Workspace | Many-to-Many via WorkspaceMember | Users can belong to multiple workspaces |
| Workspace → Project | One-to-Many | A workspace contains multiple projects |
| Project → ApiKey | One-to-Many | Each project has its own API keys |
| Project → Trace | One-to-Many | Traces are scoped to a project |
| Trace → Span | One-to-Many | Each trace contains multiple spans |

## URL Structure

All authenticated routes are prefixed with the workspace slug:

```
/workspace/{workspaceSlug}/                    # Dashboard
/workspace/{workspaceSlug}/projects            # Projects list
/workspace/{workspaceSlug}/projects/{id}       # Project detail (traces)
/workspace/{workspaceSlug}/projects/{id}/traces/{traceId}  # Trace detail
/workspace/{workspaceSlug}/settings            # Workspace settings
/workspace/{workspaceSlug}/settings/members    # Member management
/workspace/{workspaceSlug}/settings/api-keys   # API keys (per project)
```

## Authorization

### Workspace-Based Access Control

Authorization is based on **workspace membership**, not project membership. If a user is a member of a workspace, they have access to all projects within that workspace.

```typescript
// Middleware chain for workspace-scoped endpoints
protectedProcedure
  .input(z.object({ workspaceSlug: z.string() }))
  .use(workspaceMiddleware)  // Validates workspace membership
  .query(({ ctx }) => {
    // ctx.workspace contains { id, slug, role }
  });
```

### Verifying Project Belongs to Workspace

For project-scoped operations (like API keys), we verify the project belongs to the workspace:

```typescript
async function verifyProjectInWorkspace(
  projectId: string,
  workspaceId: string
): Promise<void> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, workspaceId },
    select: { id: true },
  });

  if (!project) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Project not found in this workspace",
    });
  }
}
```

### Role Hierarchy

| Role | Permissions |
|------|-------------|
| OWNER | Full access, can delete workspace, manage billing |
| ADMIN | Manage members, projects, API keys, settings |
| MEMBER | View projects, traces, create API keys |

## Frontend Patterns

### useWorkspaceUrl Hook

A global hook for workspace-relative URL generation:

```typescript
import { useWorkspaceUrl } from "@/hooks/use-workspace-url";

function MyComponent() {
  const { workspaceSlug, workspaceUrl, isActive } = useWorkspaceUrl();

  // Generate workspace-relative URLs
  const projectsUrl = workspaceUrl("/projects");  // /workspace/{slug}/projects

  // Check if current route matches
  const isProjectsActive = isActive("/projects");
}
```

### Passing Workspace Context to Components

For components that need workspace context:

```typescript
// Option 1: Use the hook directly
function ApiKeyList({ projectId }: { projectId: string }) {
  const { workspaceSlug } = useWorkspaceUrl();
  // ...
}

// Option 2: Pass as prop (for server components)
<ApiKeyList workspaceSlug={workspaceSlug} projectId={projectId} />
```

## tRPC Routers

### Workspace-Scoped Endpoints

All endpoints that access workspace data must include `workspaceSlug`:

```typescript
// projects.ts
list: protectedProcedure
  .input(z.object({ workspaceSlug: z.string().min(1) }))
  .use(workspaceMiddleware)
  .query(async ({ ctx }) => {
    // ctx.workspace.id is available
    return prisma.project.findMany({
      where: { workspaceId: ctx.workspace.id },
    });
  });

// apiKeys.ts
list: protectedProcedure
  .input(z.object({
    workspaceSlug: z.string().min(1),
    projectId: z.string().min(1),
  }))
  .use(workspaceMiddleware)
  .query(async ({ ctx, input }) => {
    await verifyProjectInWorkspace(input.projectId, ctx.workspace.id);
    // ...
  });
```

## Session Structure

The session includes workspace memberships:

```typescript
interface SessionWithWorkspaces {
  user: {
    id: string;
    email: string;
    workspaces: WorkspaceAccess[];
  };
}

interface WorkspaceAccess {
  id: string;
  slug: string;
  role: WorkspaceRole;
  isPersonal: boolean;
}
```

## Personal Workspaces

Each user gets a personal workspace on signup:

- Created automatically with `isPersonal: true`
- Slug format: `user-{randomId}`
- User is automatically assigned OWNER role
- Cannot be deleted or have other members

## Migration Notes

When migrating from project-based to workspace-based authorization:

1. Create workspaces for existing projects
2. Migrate project members to workspace members
3. Update all API endpoints to use `workspaceMiddleware`
4. Update frontend to pass `workspaceSlug` to all API calls
