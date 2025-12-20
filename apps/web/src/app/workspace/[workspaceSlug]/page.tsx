interface WorkspaceDashboardPageProps {
  params: Promise<{ workspaceSlug: string }>;
}

export default async function WorkspaceDashboardPage({
  params,
}: WorkspaceDashboardPageProps) {
  const { workspaceSlug } = await params;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome to CognObserve. Monitor your AI applications.
        </p>
      </div>

      {/* NOTE: Workspace analytics dashboard removed - will be reworked for OTLP-first design */}
      <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
        <p className="text-lg font-medium">Analytics Dashboard</p>
        <p className="text-sm">Coming soon with OTLP-first telemetry</p>
        <p className="mt-2 text-xs">
          Workspace: <code className="rounded bg-muted px-1">{workspaceSlug}</code>
        </p>
      </div>
    </div>
  );
}
