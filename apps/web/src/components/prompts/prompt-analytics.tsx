"use client";

import { useMemo } from "react";
import { BarChart3, Clock, DollarSign, AlertTriangle } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc/client";

interface PromptAnalyticsProps {
  workspaceSlug: string;
  promptId: string;
  dateRange?: {
    start: Date;
    end: Date;
  };
}

export function PromptAnalytics({
  workspaceSlug,
  promptId,
  dateRange,
}: PromptAnalyticsProps) {
  const defaultDateRange = useMemo(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    return { start, end };
  }, []);

  const { data, isLoading } = trpc.prompts.analytics.useQuery({
    workspaceSlug,
    promptId,
    dateRange: dateRange ?? defaultDateRange,
  });

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-20" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          icon={BarChart3}
          title="Total Usage"
          value={data.totalUsage.toLocaleString()}
          description="API calls in period"
        />
        <MetricCard
          icon={Clock}
          title="Avg Latency"
          value={data.avgLatencyMs ? `${data.avgLatencyMs.toFixed(0)}ms` : "—"}
          description="Response time"
        />
        <MetricCard
          icon={DollarSign}
          title="Avg Cost"
          value={data.avgCost ? `$${data.avgCost.toFixed(4)}` : "—"}
          description="Per request"
        />
        <MetricCard
          icon={AlertTriangle}
          title="Error Rate"
          value={data.errorRate ? `${data.errorRate.toFixed(1)}%` : "—"}
          description="Failed requests"
        />
      </div>

      {/* Version Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Usage by Version</CardTitle>
          <CardDescription>
            Breakdown of usage across prompt versions
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.byVersion.length === 0 || data.totalUsage === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-sm">
              <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No usage data yet</p>
              <p className="text-xs mt-1">
                Usage will appear here when prompts are fetched via SDK
              </p>
            </div>
          ) : (
              <div className="space-y-3">
                {data.byVersion.map((v) => (
                  <div
                    key={v.versionId}
                    className="flex items-center justify-between p-2 rounded-md bg-muted/50"
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">
                        v{v.version}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {v.usageCount.toLocaleString()} calls
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      {v.avgLatencyMs && (
                        <span>{v.avgLatencyMs.toFixed(0)}ms</span>
                      )}
                      {v.avgCost && <span>${v.avgCost.toFixed(4)}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
    </div>
  );
}

interface MetricCardProps {
  icon: typeof BarChart3;
  title: string;
  value: string;
  description: string;
}

function MetricCard({ icon: Icon, title, value, description }: MetricCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}
