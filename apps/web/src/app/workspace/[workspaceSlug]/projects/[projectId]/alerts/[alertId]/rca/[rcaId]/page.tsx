import { RCADetailPage } from "@/components/rca/rca-detail-page";

interface PageProps {
  params: Promise<{
    workspaceSlug: string;
    projectId: string;
    alertId: string;
    rcaId: string;
  }>;
}

export default async function Page({ params }: PageProps) {
  const { workspaceSlug, projectId, alertId, rcaId } = await params;

  return (
    <RCADetailPage
      workspaceSlug={workspaceSlug}
      projectId={projectId}
      alertId={alertId}
      rcaId={rcaId}
    />
  );
}

export const metadata = {
  title: "RCA Detail | CognObserve",
};
