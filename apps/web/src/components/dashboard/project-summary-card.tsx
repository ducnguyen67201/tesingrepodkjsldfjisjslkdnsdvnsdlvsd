"use client";

import Link from "next/link";
import { Activity, AlertTriangle, Clock, Zap, DollarSign } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
// Project summary type aligned with API response
interface ProjectSummary {
  projectId: string;
  projectName: string;
  traceCount: number;
  errorRate: number;
  avgLatency: number;
  p95Latency: number;
  tokenCount: number;
  costUsd: number;
  lastActiveAt: Date | string | null;
}

// ============================================================
// Formatters
// ============================================================

const formatNumber = (num: number): string => {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}k`;
  return num.toLocaleString();
};

const formatLatency = (ms: number): string => {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${ms.toFixed(0)}ms`;
};

const formatCurrency = (usd: number): string => {
  if (usd >= 1000) return `$${(usd / 1000).toFixed(1)}K`;
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  if (usd === 0) return "$0";
  return `$${usd.toFixed(4)}`;
};

const formatPercentage = (pct: number): string => {
  return `${pct.toFixed(1)}%`;
};

const formatRelativeTime = (dateValue: string | Date | null | undefined): string => {
  if (!dateValue) return "No activity";
  const date = typeof dateValue === "string" ? new Date(dateValue) : dateValue;
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
};

// ============================================================
// Props
// ============================================================

interface ProjectSummaryCardProps {
  summary: ProjectSummary;
  workspaceSlug: string;
}

// ============================================================
// Component
// ============================================================

export function ProjectSummaryCard({
  summary,
  workspaceSlug,
}: ProjectSummaryCardProps) {
  const hasErrors = summary.errorRate > 0;
  const isHighErrorRate = summary.errorRate > 5;
  const isActive = summary.traceCount > 0;

  return (
    <Link href={`/workspace/${workspaceSlug}/projects/${summary.projectId}`}>
      <Card className="transition-colors hover:border-primary/50">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-medium">
              {summary.projectName}
            </CardTitle>
            <Badge variant={isActive ? "default" : "secondary"} className="text-xs">
              {formatRelativeTime(summary.lastActiveAt)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {/* Trace Count */}
            <StatItem
              icon={Activity}
              label="Traces"
              value={formatNumber(summary.traceCount)}
            />

            {/* Error Rate */}
            <StatItem
              icon={AlertTriangle}
              label="Error Rate"
              value={formatPercentage(summary.errorRate)}
              className={cn(
                hasErrors && "text-amber-600",
                isHighErrorRate && "text-destructive"
              )}
            />

            {/* Avg Latency */}
            <StatItem
              icon={Clock}
              label="Avg Latency"
              value={formatLatency(summary.avgLatency)}
            />

            {/* P95 Latency */}
            <StatItem
              icon={Clock}
              label="P95 Latency"
              value={formatLatency(summary.p95Latency)}
            />

            {/* Token Count */}
            <StatItem
              icon={Zap}
              label="Tokens"
              value={formatNumber(summary.tokenCount)}
            />

            {/* Cost */}
            <StatItem
              icon={DollarSign}
              label="Cost"
              value={formatCurrency(summary.costUsd)}
            />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

// ============================================================
// StatItem Sub-component
// ============================================================

interface StatItemProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  className?: string;
}

function StatItem({ icon: Icon, label, value, className }: StatItemProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <p className={cn("text-sm font-medium", className)}>{value}</p>
    </div>
  );
}
