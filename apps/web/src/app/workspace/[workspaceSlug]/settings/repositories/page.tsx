import { RepositoriesPage } from "@/components/github/repositories-page";
import { RepositoriesErrorBoundary } from "@/components/github/repositories-error-boundary";

interface PageProps {
  params: Promise<{ workspaceSlug: string }>;
}

export default async function WorkspaceRepositoriesPage({ params }: PageProps) {
  const { workspaceSlug } = await params;
  return (
    <RepositoriesErrorBoundary>
      <RepositoriesPage workspaceSlug={workspaceSlug} />
    </RepositoriesErrorBoundary>
  );
}
