import { WorkspaceOverview } from "@/components/workspace/workspace-overview";

interface WorkspaceDashboardPageProps {
  params: Promise<{ workspaceSlug: string }>;
}

export default async function WorkspaceDashboardPage({
  params,
}: WorkspaceDashboardPageProps) {
  const { workspaceSlug } = await params;

  return <WorkspaceOverview workspaceSlug={workspaceSlug} />;
}
