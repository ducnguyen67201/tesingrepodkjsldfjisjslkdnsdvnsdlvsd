"use client";

import { memo } from "react";
import {
  Activity,
  AlertTriangle,
  Clock,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { WorkspaceStats, StatTrend } from "@cognobserve/api/schemas";

// ============================================================
// Props
// ============================================================

interface WorkspaceStatsRowProps {
  stats: WorkspaceStats | null;
  isLoading: boolean;
}

// ============================================================
// Component
// ============================================================

export const WorkspaceStatsRow = memo(function WorkspaceStatsRow({
  stats,
  isLoading,
}: WorkspaceStatsRowProps) {
  if (isLoading) {
    return <StatsRowSkeleton />;
  }

  if (!stats) {
    return null;
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <StatCard
        title="Total Traces"
        value={formatNumber(stats.totalTraces.current)}
        trend={stats.totalTraces}
        icon={Activity}
        trendPositiveIsGood={true}
      />
      <StatCard
        title="Total Errors"
        value={formatNumber(stats.totalErrors.current)}
        trend={stats.totalErrors}
        icon={AlertTriangle}
        trendPositiveIsGood={false}
      />
      <StatCard
        title="P95 Latency"
        value={formatLatency(stats.avgLatencyP95Ms.current)}
        trend={stats.avgLatencyP95Ms}
        icon={Clock}
        trendPositiveIsGood={false}
      />
      <StatCard
        title="Active Alerts"
        value={stats.activeAlerts.toString()}
        icon={AlertTriangle}
        alertCount={stats.activeAlerts}
      />
    </div>
  );
});

// ============================================================
// StatCard Component
// ============================================================

interface StatCardProps {
  title: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  trend?: StatTrend;
  trendPositiveIsGood?: boolean;
  alertCount?: number;
}

const StatCard = memo(function StatCard({
  title,
  value,
  icon: Icon,
  trend,
  trendPositiveIsGood = true,
  alertCount,
}: StatCardProps) {
  const getTrendColor = (): string => {
    if (!trend) return "text-muted-foreground";

    const isPositive = trend.direction === "up";
    const isGood = trendPositiveIsGood ? isPositive : !isPositive;

    if (trend.direction === "flat") return "text-muted-foreground";
    return isGood ? "text-green-600" : "text-red-600";
  };

  const renderTrendIcon = () => {
    if (!trend) return null;

    switch (trend.direction) {
      case "up":
        return <TrendingUp className="h-3 w-3" />;
      case "down":
        return <TrendingDown className="h-3 w-3" />;
      default:
        return <Minus className="h-3 w-3" />;
    }
  };

  const getAlertColor = (): string => {
    if (alertCount === undefined) return "";
    if (alertCount === 0) return "text-green-600";
    if (alertCount <= 2) return "text-yellow-600";
    return "text-red-600";
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className={`text-2xl font-bold ${alertCount !== undefined ? getAlertColor() : ""}`}>
              {value}
            </p>
            {trend && (
              <div className={`flex items-center gap-1 text-xs ${getTrendColor()}`}>
                {renderTrendIcon()}
                <span>
                  {trend.percentChange > 0 ? "+" : ""}
                  {trend.percentChange.toFixed(1)}% vs previous
                </span>
              </div>
            )}
          </div>
          <div className="rounded-full bg-muted p-3">
            <Icon className="h-5 w-5 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
});

// ============================================================
// Skeleton
// ============================================================

function StatsRowSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={`stat-skeleton-${i}`}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-16" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-12 w-12 rounded-full" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ============================================================
// Helpers
// ============================================================

function formatNumber(num: number): string {
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1)}K`;
  }
  return num.toString();
}

function formatLatency(ms: number): string {
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(2)}s`;
  }
  return `${Math.round(ms)}ms`;
}
