"use client";

import { AlertTriangle, Clock, CheckCircle, Bell } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc/client";
import { ALERT_TYPE_LABELS, type AlertType } from "@cognobserve/api/schemas";
import { formatDistanceToNow } from "date-fns";
import { RCAActionCell } from "./rca-action-cell";

interface AlertHistoryProps {
  workspaceSlug: string;
  projectId: string;
  enabled: boolean;
}

const ALERT_TYPE_ICONS: Record<AlertType, typeof AlertTriangle> = {
  ERROR_RATE: AlertTriangle,
  LATENCY_P50: Clock,
  LATENCY_P95: Clock,
  LATENCY_P99: Clock,
};

const ALERT_TYPE_COLORS: Record<AlertType, string> = {
  ERROR_RATE: "bg-red-100 text-red-600 border-red-200",
  LATENCY_P50: "bg-amber-100 text-amber-600 border-amber-200",
  LATENCY_P95: "bg-orange-100 text-orange-600 border-orange-200",
  LATENCY_P99: "bg-rose-100 text-rose-600 border-rose-200",
};

export function AlertHistory({ workspaceSlug, projectId, enabled }: AlertHistoryProps) {
  const { data, isLoading } = trpc.alerts.projectHistory.useQuery(
    { workspaceSlug, projectId, limit: 50 },
    { enabled }
  );

  if (isLoading) {
    return <HistorySkeleton />;
  }

  if (!data?.items.length) {
    return <EmptyHistory />;
  }

  return (
    <div className="relative">
      {/* Timeline line */}
      <div className="absolute left-[19px] top-0 bottom-0 w-px bg-border" />

      <div className="space-y-0">
        {data.items.map((item, index) => (
          <HistoryItem
            key={item.id}
            item={item}
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            isFirst={index === 0}
            isLast={index === data.items.length - 1}
          />
        ))}
      </div>
    </div>
  );
}

interface HistoryItemProps {
  item: {
    id: string;
    triggeredAt: Date;
    value: number;
    threshold: number;
    resolved: boolean;
    resolvedAt: Date | null;
    notifiedVia: string[];
    alert: {
      id: string;
      name: string;
      type: string;
      threshold: number;
      operator: string;
    };
  };
  workspaceSlug: string;
  projectId: string;
  isFirst: boolean;
  isLast: boolean;
}

function HistoryItem({ item, workspaceSlug, projectId, isFirst, isLast }: HistoryItemProps) {
  const alertType = item.alert.type as AlertType;
  const Icon = ALERT_TYPE_ICONS[alertType] ?? AlertTriangle;
  const colorClasses = ALERT_TYPE_COLORS[alertType] ?? "bg-gray-100 text-gray-600 border-gray-200";

  const formatValue = (type: AlertType, value: number): string => {
    if (type === "ERROR_RATE") {
      return `${value.toFixed(2)}%`;
    }
    return `${value.toFixed(0)}ms`;
  };

  const operatorSymbol = item.alert.operator === "GREATER_THAN" ? ">" : "<";
  const triggeredAgo = formatDistanceToNow(new Date(item.triggeredAt), { addSuffix: true });

  return (
    <div className={`relative flex gap-4 ${isFirst ? "pt-0" : "pt-4"} ${isLast ? "pb-0" : "pb-4"}`}>
      {/* Icon */}
      <div
        className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 ${colorClasses}`}
      >
        <Icon className="h-4 w-4" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pt-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm">
              <span className="font-medium">{item.alert.name}</span>
              {" triggered"}
            </p>
            <p className="text-sm text-muted-foreground mt-0.5">
              {ALERT_TYPE_LABELS[alertType]}: {formatValue(alertType, item.value)}{" "}
              <span className="text-muted-foreground/70">
                (threshold: {operatorSymbol} {formatValue(alertType, item.threshold)})
              </span>
            </p>
            {item.notifiedVia.length > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                Notified via: {item.notifiedVia.join(", ")}
              </p>
            )}
          </div>
          <div className="shrink-0 flex items-center gap-2">
            {item.resolved && (
              <CheckCircle className="h-4 w-4 text-green-500" />
            )}
            <RCAActionCell
              alertHistoryId={item.id}
              alertId={item.alert.id}
              workspaceSlug={workspaceSlug}
              projectId={projectId}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">{triggeredAgo}</p>
      </div>
    </div>
  );
}

function HistorySkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex gap-4">
          <Skeleton className="h-10 w-10 rounded-full shrink-0" />
          <div className="flex-1 space-y-2 pt-1">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-64" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyHistory() {
  return (
    <div className="text-center py-12">
      <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
        <Bell className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="font-medium mb-2">No alert history</h3>
      <p className="text-sm text-muted-foreground">
        Alert triggers will appear here when thresholds are exceeded.
      </p>
    </div>
  );
}
