"use client";

import { memo } from "react";
import {
  Bell,
  CheckCircle,
  AlertTriangle,
  Clock,
  AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import type { RecentActivityItem, ActivityType, AlertSeverity } from "@cognobserve/api/schemas";

// ============================================================
// Props
// ============================================================

interface RecentActivityFeedProps {
  activities: RecentActivityItem[];
  isLoading: boolean;
}

// ============================================================
// Component
// ============================================================

export const RecentActivityFeed = memo(function RecentActivityFeed({
  activities,
  isLoading,
}: RecentActivityFeedProps) {
  if (isLoading) {
    return <ActivityFeedSkeleton />;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base font-medium">Recent Activity</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <EmptyActivityState />
        ) : (
          <div className="space-y-4">
            {activities.map((activity) => (
              <ActivityItem key={activity.id} activity={activity} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
});

// ============================================================
// ActivityItem Component
// ============================================================

interface ActivityItemProps {
  activity: RecentActivityItem;
}

const ActivityItem = memo(function ActivityItem({ activity }: ActivityItemProps) {
  const Icon = getActivityIcon(activity.type);
  const iconColor = getActivityIconColor(activity.type);

  return (
    <div className="flex items-start gap-3">
      <div className={`mt-0.5 rounded-full p-1.5 ${iconColor}`}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium truncate">{activity.title}</p>
          {activity.severity && (
            <SeverityBadge severity={activity.severity} />
          )}
        </div>
        {activity.description && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {activity.description}
          </p>
        )}
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-muted-foreground">
            {activity.projectName}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatRelativeTime(activity.timestamp)}
          </span>
        </div>
      </div>
    </div>
  );
});

// ============================================================
// SeverityBadge Component
// ============================================================

interface SeverityBadgeProps {
  severity: AlertSeverity;
}

function SeverityBadge({ severity }: SeverityBadgeProps) {
  const variant = getSeverityVariant(severity);

  return (
    <Badge variant={variant} className="text-[10px] px-1.5 py-0">
      {severity}
    </Badge>
  );
}

// ============================================================
// Empty State
// ============================================================

function EmptyActivityState() {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <Bell className="mb-3 h-8 w-8 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">
        No recent activity
      </p>
      <p className="text-xs text-muted-foreground mt-1">
        Activity will appear when alerts fire or resolve
      </p>
    </div>
  );
}

// ============================================================
// Skeleton
// ============================================================

function ActivityFeedSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <Skeleton className="h-5 w-32" />
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={`activity-skeleton-${i}`} className="flex items-start gap-3">
              <Skeleton className="h-7 w-7 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Helpers
// ============================================================

function getActivityIcon(type: ActivityType) {
  switch (type) {
    case "alert_fired":
      return AlertTriangle;
    case "alert_resolved":
      return CheckCircle;
    case "alert_pending":
      return Clock;
    default:
      return AlertCircle;
  }
}

function getActivityIconColor(type: ActivityType): string {
  switch (type) {
    case "alert_fired":
      return "bg-red-100 text-red-600";
    case "alert_resolved":
      return "bg-green-100 text-green-600";
    case "alert_pending":
      return "bg-yellow-100 text-yellow-600";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

function getSeverityVariant(severity: AlertSeverity): "default" | "secondary" | "destructive" | "outline" {
  switch (severity) {
    case "CRITICAL":
      return "destructive";
    case "HIGH":
      return "destructive";
    case "MEDIUM":
      return "secondary";
    case "LOW":
      return "outline";
    default:
      return "outline";
  }
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return new Date(date).toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}
