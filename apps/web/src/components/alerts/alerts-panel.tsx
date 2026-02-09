"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import {
  Bell,
  Plus,
  AlertTriangle,
  Clock,
  MoreVertical,
  Trash2,
  Play,
  FlaskConical,
  Circle,
  CircleDot,
  CircleCheck,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc/client";
import { CreateAlertDialog } from "./create-alert-dialog";
import { EditAlertDialog } from "./edit-alert-dialog";
import { AlertHistory } from "./alert-history";
import { ChannelSelectDropdown } from "./channel-select-dropdown";
import { SeverityBadge } from "./severity-selector";
import { showError } from "@/lib/errors";
import { alertToast } from "@/lib/success";
import {
  ALERT_TYPE_LABELS,
  STATE_LABELS,
  type AlertType,
  type AlertState,
  type AlertSeverity,
} from "@ducsigr/api/schemas";

interface AlertsPanelProps {
  workspaceSlug: string;
  projectId: string;
}

const ALERT_TYPE_ICONS: Record<string, typeof AlertTriangle> = {
  ERROR_RATE: AlertTriangle,
  LATENCY_P50: Clock,
  LATENCY_P95: Clock,
  LATENCY_P99: Clock,
};

const STATE_ICONS: Record<AlertState, typeof Circle> = {
  INACTIVE: Circle,
  PENDING: CircleDot,
  FIRING: CircleDot,
  RESOLVED: CircleCheck,
};

const STATE_COLORS: Record<AlertState, string> = {
  INACTIVE: "text-muted-foreground",
  PENDING: "text-amber-500",
  FIRING: "text-red-500 animate-pulse",
  RESOLVED: "text-green-500",
};

interface StateIndicatorProps {
  state: AlertState;
  className?: string;
}

function StateIndicator({ state, className }: StateIndicatorProps) {
  const Icon = STATE_ICONS[state] ?? Circle;
  const color = STATE_COLORS[state] ?? "text-muted-foreground";
  const label = STATE_LABELS[state] ?? state;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn("flex items-center gap-1", className)}>
            <Icon className={cn("h-3 w-3", color)} />
            <span className="text-xs text-muted-foreground">{label}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>Alert state: {label}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function calculatePendingProgress(stateChangedAt: Date | null, pendingMins: number): number {
  if (!stateChangedAt || pendingMins === 0) return 0;
  const elapsed = (Date.now() - new Date(stateChangedAt).getTime()) / 1000 / 60;
  return Math.min(100, (elapsed / pendingMins) * 100);
}

function calculateCooldownProgress(lastTriggeredAt: Date | null, cooldownMins: number): number {
  if (!lastTriggeredAt) return 100;
  if (cooldownMins === 0) return 100; // No cooldown — always ready to notify
  const elapsed = (Date.now() - new Date(lastTriggeredAt).getTime()) / 1000 / 60;
  return Math.min(100, (elapsed / cooldownMins) * 100);
}

type AlertForEdit = {
  id: string;
  name: string;
  type: AlertType;
  threshold: number;
  operator: "GREATER_THAN" | "LESS_THAN";
  windowMins: number;
  cooldownMins: number;
  severity: AlertSeverity;
  pendingMins: number;
};

export function AlertsPanel({ workspaceSlug, projectId }: AlertsPanelProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("alerts");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingAlert, setEditingAlert] = useState<AlertForEdit | null>(null);

  // Read URL params on mount and auto-open panel if alertPanel param exists
  // Uses unique param names to avoid conflict with page-level tabs
  useEffect(() => {
    const alertPanelParam = searchParams.get("alertPanel");
    const alertTabParam = searchParams.get("alertTab");

    if (alertPanelParam) {
      setIsOpen(true);
      if (alertTabParam === "history" || alertTabParam === "alerts") {
        setActiveTab(alertTabParam);
      } else {
        setActiveTab("history"); // Default to history when coming from RCA
      }
    }
  }, [searchParams]);

  // Update URL when panel opens/closes
  const handleOpenChange = useCallback(
    (open: boolean) => {
      setIsOpen(open);

      const params = new URLSearchParams(searchParams.toString());

      if (open) {
        // Add URL params when opening (use unique param names)
        if (!params.get("alertPanel")) {
          params.set("alertPanel", "open");
        }
        params.set("alertTab", activeTab);
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      } else {
        // Clear URL params when closing
        params.delete("alertPanel");
        params.delete("alertTab");
        const newUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
        router.replace(newUrl, { scroll: false });
      }
    },
    [searchParams, pathname, router, activeTab]
  );

  const utils = trpc.useUtils();
  const { data: alerts, isLoading } = trpc.alerts.list.useQuery(
    { workspaceSlug, projectId },
    { enabled: isOpen }
  );

  const toggleMutation = trpc.alerts.toggle.useMutation({
    onSuccess: () => {
      utils.alerts.list.invalidate();
      alertToast.updated();
    },
    onError: showError,
  });

  const deleteMutation = trpc.alerts.delete.useMutation({
    onSuccess: () => {
      utils.alerts.list.invalidate();
      alertToast.deleted();
    },
    onError: showError,
  });

  const testAlertMutation = trpc.alerts.testAlert.useMutation({
    onSuccess: (result) => {
      const successCount = result.results.filter((r) => r.success).length;
      alertToast.testSent(successCount, result.results.length);
    },
    onError: showError,
  });

  const handleToggle = useCallback(
    (id: string) => {
      toggleMutation.mutate({ workspaceSlug, id });
    },
    [toggleMutation, workspaceSlug]
  );

  const handleDelete = useCallback(
    (id: string) => {
      deleteMutation.mutate({ workspaceSlug, id });
    },
    [deleteMutation, workspaceSlug]
  );

  const handleTestAlert = useCallback(
    (alertId: string) => {
      testAlertMutation.mutate({ workspaceSlug, alertId });
    },
    [testAlertMutation, workspaceSlug]
  );

  const handleDryRun = useCallback(
    (id: string) => {
      // Dry run opens a modal - handled per-card
      console.log("Dry run for alert:", id);
    },
    []
  );

  const handleEdit = useCallback((alert: AlertForEdit) => {
    setEditingAlert(alert);
  }, []);

  const handleCloseEditDialog = useCallback(() => {
    setEditingAlert(null);
  }, []);

  const handleCloseCreateDialog = useCallback(() => {
    setIsCreateOpen(false);
  }, []);

  const handleTabChange = useCallback(
    (value: string) => {
      setActiveTab(value);

      // Update URL with new tab value if alertPanel param exists
      const alertPanelParam = searchParams.get("alertPanel");
      if (alertPanelParam) {
        const params = new URLSearchParams(searchParams.toString());
        params.set("alertTab", value);
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      }
    },
    [searchParams, pathname, router]
  );

  const activeAlerts = alerts?.filter((a) => a.enabled).length ?? 0;

  return (
    <>
      <Sheet open={isOpen} onOpenChange={handleOpenChange}>
        <SheetTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs px-2.5">
            <Bell className="h-3 w-3" />
            Alerts
            {activeAlerts > 0 && (
              <Badge variant="secondary" className="ml-0.5 h-4 px-1 text-[10px]">
                {activeAlerts}
              </Badge>
            )}
          </Button>
        </SheetTrigger>
        <SheetContent className="w-[400px] sm:w-[540px] sm:max-w-[540px] flex flex-col p-0">
          <SheetHeader className="p-6 pb-4 border-b">
            <div className="flex items-center justify-between pr-8">
              <SheetTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Project Alerts
              </SheetTitle>
              {activeTab === "alerts" && (
                <Button size="sm" onClick={() => setIsCreateOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  New Alert
                </Button>
              )}
            </div>
          </SheetHeader>

          <Tabs value={activeTab} onValueChange={handleTabChange} className="flex-1 flex flex-col">
            <div className="px-6 pt-4">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="alerts">Alerts</TabsTrigger>
                <TabsTrigger value="history">History</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="alerts" className="flex-1 mt-0">
              <ScrollArea className="h-[calc(100vh-180px)]">
                <div className="p-6 space-y-4">
                  {isLoading ? (
                    <AlertsSkeleton />
                  ) : alerts?.length === 0 ? (
                    <EmptyState onCreateClick={() => setIsCreateOpen(true)} />
                  ) : (
                    alerts?.map((alert) => (
                      <AlertCard
                        key={alert.id}
                        alert={alert}
                        workspaceSlug={workspaceSlug}
                        onToggle={handleToggle}
                        onDelete={handleDelete}
                        onTestAlert={handleTestAlert}
                        onDryRun={handleDryRun}
                        onEdit={handleEdit}
                      />
                    ))
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="history" className="flex-1 mt-0">
              <ScrollArea className="h-[calc(100vh-180px)]">
                <div className="p-6">
                  <AlertHistory
                    workspaceSlug={workspaceSlug}
                    projectId={projectId}
                    enabled={isOpen && activeTab === "history"}
                  />
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>

      <CreateAlertDialog
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        open={isCreateOpen}
        onClose={handleCloseCreateDialog}
      />

      {editingAlert && (
        <EditAlertDialog
          workspaceSlug={workspaceSlug}
          alert={editingAlert}
          open={!!editingAlert}
          onClose={handleCloseEditDialog}
        />
      )}
    </>
  );
}

interface AlertCardProps {
  alert: {
    id: string;
    name: string;
    type: AlertType;
    threshold: number;
    operator: string;
    windowMins: number;
    cooldownMins: number;
    enabled: boolean;
    severity: AlertSeverity;
    state: AlertState;
    stateChangedAt: Date | null;
    pendingMins: number;
    lastTriggeredAt: Date | null;
    channels: Array<{ id: string; provider: string; verified: boolean }>;
    _count: { history: number };
  };
  workspaceSlug: string;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onTestAlert: (id: string) => void;
  onDryRun: (id: string) => void;
  onEdit: (alert: AlertForEdit) => void;
}

function AlertCard({ alert, workspaceSlug, onToggle, onDelete, onTestAlert, onDryRun, onEdit }: AlertCardProps) {
  const utils = trpc.useUtils();
  const Icon = ALERT_TYPE_ICONS[alert.type] ?? AlertTriangle;
  const thresholdDisplay =
    alert.type === "ERROR_RATE" ? `${alert.threshold}%` : `${alert.threshold}ms`;
  const operatorDisplay = alert.operator === "GREATER_THAN" ? ">" : "<";

  const { data: workspaceChannels, isLoading: isLoadingChannels } = trpc.channels.list.useQuery({
    workspaceSlug,
  });
  const { data: linkedChannels } = trpc.alerts.getLinkedChannels.useQuery({
    workspaceSlug,
    alertId: alert.id,
  });

  const linkChannel = trpc.alerts.linkChannel.useMutation({
    onSuccess: () => {
      utils.alerts.getLinkedChannels.invalidate({ workspaceSlug, alertId: alert.id });
    },
    onError: showError,
  });

  const unlinkChannel = trpc.alerts.unlinkChannel.useMutation({
    onSuccess: () => {
      utils.alerts.getLinkedChannels.invalidate({ workspaceSlug, alertId: alert.id });
    },
    onError: showError,
  });

  const linkedIds = useMemo(
    () => new Set(linkedChannels?.map((c) => c.id) ?? []),
    [linkedChannels]
  );

  const handleToggleClick = () => onToggle(alert.id);
  const handleDeleteClick = () => onDelete(alert.id);
  const handleTestAlertClick = () => onTestAlert(alert.id);
  const handleDryRunClick = () => onDryRun(alert.id);
  const handleEditClick = () => onEdit({
    id: alert.id,
    name: alert.name,
    type: alert.type,
    threshold: alert.threshold,
    operator: alert.operator as "GREATER_THAN" | "LESS_THAN",
    windowMins: alert.windowMins,
    cooldownMins: alert.cooldownMins,
    severity: alert.severity,
    pendingMins: alert.pendingMins,
  });

  const handleChannelToggle = useCallback(
    (channelId: string) => {
      if (linkedIds.has(channelId)) {
        unlinkChannel.mutate({ workspaceSlug, alertId: alert.id, channelId });
      } else {
        linkChannel.mutate({ workspaceSlug, alertId: alert.id, channelId });
      }
    },
    [linkedIds, unlinkChannel, linkChannel, workspaceSlug, alert.id]
  );

  const channels = workspaceChannels?.map((c) => ({
    id: c.id,
    name: c.name,
    provider: c.provider,
  })) ?? [];

  // Calculate progress for pending/cooldown states
  const pendingProgress = useMemo(
    () =>
      alert.state === "PENDING"
        ? calculatePendingProgress(alert.stateChangedAt, alert.pendingMins)
        : 0,
    [alert.state, alert.stateChangedAt, alert.pendingMins]
  );

  const cooldownProgress = useMemo(
    () =>
      alert.state === "FIRING"
        ? calculateCooldownProgress(alert.lastTriggeredAt, alert.cooldownMins)
        : 100,
    [alert.state, alert.lastTriggeredAt, alert.cooldownMins]
  );

  return (
    <div
      className={cn(
        "rounded-lg border p-4 space-y-4",
        !alert.enabled ? "opacity-60 bg-muted/50" : "bg-card",
        alert.state === "FIRING" && "border-red-500/50"
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "rounded-lg p-2",
              alert.type === "ERROR_RATE"
                ? "bg-destructive/10 text-destructive"
                : "bg-amber-500/10 text-amber-600"
            )}
          >
            <Icon className="h-4 w-4" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h4 className="font-medium">{alert.name}</h4>
              <SeverityBadge severity={alert.severity} className="text-xs" />
              {!alert.enabled && (
                <Badge variant="secondary" className="text-xs">
                  Disabled
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <p className="text-sm text-muted-foreground">
                {ALERT_TYPE_LABELS[alert.type]} {operatorDisplay} {thresholdDisplay}
              </p>
              <StateIndicator state={alert.state} />
            </div>
            <p className="text-xs text-muted-foreground">
              Window: {alert.windowMins}min
              {alert._count.history > 0 && (
                <span className="ml-2">
                  ({alert._count.history} trigger{alert._count.history !== 1 ? "s" : ""})
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Switch checked={alert.enabled} onCheckedChange={handleToggleClick} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleEditClick}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleTestAlertClick}>
                <Play className="mr-2 h-4 w-4" />
                Test Alert
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDryRunClick}>
                <FlaskConical className="mr-2 h-4 w-4" />
                Dry Run
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleDeleteClick} className="text-destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Pending Progress Bar */}
      {alert.state === "PENDING" && alert.pendingMins > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-amber-600">Pending confirmation...</span>
            <span className="text-muted-foreground">
              {Math.round(pendingProgress)}% ({alert.pendingMins}min threshold)
            </span>
          </div>
          <Progress value={pendingProgress} className="h-1.5 bg-amber-100" />
        </div>
      )}

      {/* Cooldown Progress Bar — hidden when cooldown is 0 (instant alerting) */}
      {alert.state === "FIRING" && alert.cooldownMins > 0 && cooldownProgress < 100 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-red-600">In cooldown...</span>
            <span className="text-muted-foreground">
              {Math.round(cooldownProgress)}% ({alert.cooldownMins}min cooldown)
            </span>
          </div>
          <Progress value={cooldownProgress} className="h-1.5 bg-red-100" />
        </div>
      )}
      {alert.state === "FIRING" && alert.cooldownMins === 0 && (
        <div className="text-xs text-red-600 font-medium">
          No cooldown — alerting every eval cycle
        </div>
      )}

      <ChannelSelectDropdown
        channels={channels}
        selectedIds={linkedIds}
        onToggle={handleChannelToggle}
        workspaceSlug={workspaceSlug}
        isLoading={isLoadingChannels}
      />
    </div>
  );
}

function AlertsSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="rounded-lg border p-4">
          <div className="flex items-start gap-3">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

interface EmptyStateProps {
  onCreateClick: () => void;
}

function EmptyState({ onCreateClick }: EmptyStateProps) {
  return (
    <div className="text-center py-12">
      <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
        <Bell className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="font-medium mb-2">No alerts configured</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Create alerts to get notified when metrics exceed thresholds.
      </p>
      <Button onClick={onCreateClick}>
        <Plus className="h-4 w-4 mr-2" />
        Create Alert
      </Button>
    </div>
  );
}
