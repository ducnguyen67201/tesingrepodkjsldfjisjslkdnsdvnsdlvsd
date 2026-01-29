# Sprint 3: UI & Alert History

**Issue:** #80
**Points:** 5
**Dependencies:** Sprint 1 & 2

---

## 1. Overview

Build the user interface for alert management: alerts settings page, create/edit modal, notification channel configuration, and alert history view.

### Deliverables

| Component | Type | Priority |
|-----------|------|----------|
| Alerts settings page | Page | P0 |
| Create/Edit alert modal | Component | P0 |
| Add channel modal | Component | P0 |
| Alert history page | Page | P1 |
| Dashboard alert indicators | Component | P1 |

---

## 2. Page Structure

### 2.1 Route Structure

```
/workspace/[workspaceSlug]/
├── project/[projectId]/
│   └── settings/
│       ├── alerts/                    # Alerts list page
│       │   └── page.tsx
│       └── alerts/[alertId]/
│           └── history/               # Alert history page
│               └── page.tsx
```

### 2.2 Component Hierarchy

```
AlertsSettingsPage
├── AlertsHeader
│   ├── Title
│   └── CreateAlertButton
├── AlertsList
│   └── AlertCard (repeating)
│       ├── AlertInfo
│       ├── AlertStatus (enabled/disabled)
│       ├── ChannelBadges
│       └── AlertActions (edit, toggle, delete)
├── CreateAlertModal
│   ├── AlertForm
│   └── ChannelsList
└── AddChannelModal
    ├── ProviderSelector
    └── ProviderConfigForm
```

---

## 3. Components

### 3.1 Alerts Settings Page

```tsx
// apps/web/src/app/workspace/[workspaceSlug]/project/[projectId]/settings/alerts/page.tsx

import { Suspense } from "react";
import { AlertsHeader } from "@/components/settings/alerts/alerts-header";
import { AlertsList } from "@/components/settings/alerts/alerts-list";
import { AlertsListSkeleton } from "@/components/settings/alerts/alerts-skeleton";

interface AlertsPageProps {
  params: Promise<{
    workspaceSlug: string;
    projectId: string;
  }>;
}

export default async function AlertsPage({ params }: AlertsPageProps) {
  const { projectId } = await params;

  return (
    <div className="space-y-6">
      <AlertsHeader projectId={projectId} />
      <Suspense fallback={<AlertsListSkeleton />}>
        <AlertsList projectId={projectId} />
      </Suspense>
    </div>
  );
}
```

### 3.2 Alerts Header

```tsx
// apps/web/src/components/settings/alerts/alerts-header.tsx

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { CreateAlertModal } from "./create-alert-modal";

interface AlertsHeaderProps {
  projectId: string;
}

export function AlertsHeader({ projectId }: AlertsHeaderProps) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const handleOpenCreate = () => setIsCreateOpen(true);
  const handleCloseCreate = () => setIsCreateOpen(false);

  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-semibold">Alerts</h1>
        <p className="text-muted-foreground">
          Configure alerts for error rates and latency thresholds
        </p>
      </div>
      <Button onClick={handleOpenCreate}>
        <Plus className="mr-2 h-4 w-4" />
        Create Alert
      </Button>
      <CreateAlertModal
        projectId={projectId}
        open={isCreateOpen}
        onClose={handleCloseCreate}
      />
    </div>
  );
}
```

### 3.3 Alerts List

```tsx
// apps/web/src/components/settings/alerts/alerts-list.tsx

"use client";

import { trpc } from "@/lib/trpc/client";
import { AlertCard } from "./alert-card";
import { Card, CardContent } from "@/components/ui/card";
import { Bell } from "lucide-react";

interface AlertsListProps {
  projectId: string;
}

export function AlertsList({ projectId }: AlertsListProps) {
  const { data: alerts, isLoading } = trpc.alerts.list.useQuery({ projectId });

  if (isLoading) {
    return <AlertsListSkeleton />;
  }

  if (!alerts?.length) {
    return <EmptyState />;
  }

  return (
    <div className="space-y-4">
      {alerts.map((alert) => (
        <AlertCard key={alert.id} alert={alert} />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-12">
        <Bell className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium">No alerts configured</h3>
        <p className="text-muted-foreground text-center mt-2">
          Create your first alert to get notified when metrics exceed thresholds
        </p>
      </CardContent>
    </Card>
  );
}
```

### 3.4 Alert Card

```tsx
// apps/web/src/components/settings/alerts/alert-card.tsx

"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertTriangle,
  Clock,
  MoreVertical,
  Pencil,
  Trash2,
  History,
  Mail,
  MessageSquare,
} from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { EditAlertModal } from "./edit-alert-modal";
import { DeleteAlertDialog } from "./delete-alert-dialog";
import Link from "next/link";

interface AlertCardProps {
  alert: {
    id: string;
    name: string;
    type: string;
    threshold: number;
    operator: string;
    windowMins: number;
    enabled: boolean;
    channels: Array<{ id: string; provider: string; verified: boolean }>;
    _count: { history: number };
  };
}

const TYPE_LABELS: Record<string, string> = {
  ERROR_RATE: "Error Rate",
  LATENCY_P50: "Latency P50",
  LATENCY_P95: "Latency P95",
  LATENCY_P99: "Latency P99",
};

const TYPE_ICONS: Record<string, typeof AlertTriangle> = {
  ERROR_RATE: AlertTriangle,
  LATENCY_P50: Clock,
  LATENCY_P95: Clock,
  LATENCY_P99: Clock,
};

const CHANNEL_ICONS: Record<string, typeof Mail> = {
  GMAIL: Mail,
  DISCORD: MessageSquare,
};

export function AlertCard({ alert }: AlertCardProps) {
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  const utils = trpc.useUtils();
  const toggleMutation = trpc.alerts.toggle.useMutation({
    onSuccess: () => utils.alerts.list.invalidate(),
  });

  const handleOpenEdit = () => setIsEditOpen(true);
  const handleCloseEdit = () => setIsEditOpen(false);
  const handleOpenDelete = () => setIsDeleteOpen(true);
  const handleCloseDelete = () => setIsDeleteOpen(false);
  const handleToggle = () => toggleMutation.mutate({ id: alert.id });

  const Icon = TYPE_ICONS[alert.type] ?? AlertTriangle;
  const thresholdDisplay =
    alert.type === "ERROR_RATE"
      ? `${alert.threshold}%`
      : `${alert.threshold}ms`;
  const operatorDisplay = alert.operator === "GREATER_THAN" ? ">" : "<";

  return (
    <>
      <Card className={!alert.enabled ? "opacity-60" : ""}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="rounded-lg bg-muted p-2">
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-medium">{alert.name}</h3>
                  {!alert.enabled && (
                    <Badge variant="secondary">Disabled</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {TYPE_LABELS[alert.type]} {operatorDisplay} {thresholdDisplay}{" "}
                  (last {alert.windowMins}min)
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {/* Channel badges */}
              <div className="flex gap-1">
                {alert.channels.map((channel) => {
                  const ChannelIcon = CHANNEL_ICONS[channel.provider] ?? Mail;
                  return (
                    <Badge
                      key={channel.id}
                      variant={channel.verified ? "default" : "outline"}
                      className="gap-1"
                    >
                      <ChannelIcon className="h-3 w-3" />
                      {channel.provider}
                    </Badge>
                  );
                })}
              </div>

              {/* Trigger count */}
              {alert._count.history > 0 && (
                <Badge variant="secondary">{alert._count.history} triggers</Badge>
              )}

              {/* Toggle */}
              <Switch
                checked={alert.enabled}
                onCheckedChange={handleToggle}
                disabled={toggleMutation.isPending}
              />

              {/* Actions menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleOpenEdit}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href={`alerts/${alert.id}/history`}>
                      <History className="mr-2 h-4 w-4" />
                      View History
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={handleOpenDelete}
                    className="text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardContent>
      </Card>

      <EditAlertModal
        alert={alert}
        open={isEditOpen}
        onClose={handleCloseEdit}
      />
      <DeleteAlertDialog
        alertId={alert.id}
        alertName={alert.name}
        open={isDeleteOpen}
        onClose={handleCloseDelete}
      />
    </>
  );
}
```

### 3.5 Create Alert Modal

```tsx
// apps/web/src/components/settings/alerts/create-alert-modal.tsx

"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc/client";
import { toast } from "sonner";

const ALERT_TYPES = [
  { value: "ERROR_RATE", label: "Error Rate (%)" },
  { value: "LATENCY_P50", label: "Latency P50 (ms)" },
  { value: "LATENCY_P95", label: "Latency P95 (ms)" },
  { value: "LATENCY_P99", label: "Latency P99 (ms)" },
];

const WINDOW_OPTIONS = [
  { value: "1", label: "1 minute" },
  { value: "5", label: "5 minutes" },
  { value: "15", label: "15 minutes" },
  { value: "30", label: "30 minutes" },
  { value: "60", label: "1 hour" },
];

const COOLDOWN_OPTIONS = [
  { value: "5", label: "5 minutes" },
  { value: "15", label: "15 minutes" },
  { value: "30", label: "30 minutes" },
  { value: "60", label: "1 hour" },
  { value: "240", label: "4 hours" },
  { value: "1440", label: "24 hours" },
];

const formSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  type: z.enum(["ERROR_RATE", "LATENCY_P50", "LATENCY_P95", "LATENCY_P99"]),
  threshold: z.coerce.number().min(0, "Threshold must be positive"),
  operator: z.enum(["GREATER_THAN", "LESS_THAN"]),
  windowMins: z.coerce.number().int().min(1).max(60),
  cooldownMins: z.coerce.number().int().min(1).max(1440),
});

type FormData = z.infer<typeof formSchema>;

interface CreateAlertModalProps {
  projectId: string;
  open: boolean;
  onClose: () => void;
}

export function CreateAlertModal({
  projectId,
  open,
  onClose,
}: CreateAlertModalProps) {
  const utils = trpc.useUtils();
  const createMutation = trpc.alerts.create.useMutation({
    onSuccess: () => {
      utils.alerts.list.invalidate();
      toast.success("Alert created successfully");
      onClose();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      type: "ERROR_RATE",
      threshold: 5,
      operator: "GREATER_THAN",
      windowMins: 5,
      cooldownMins: 60,
    },
  });

  const handleSubmit = (data: FormData) => {
    createMutation.mutate({ projectId, ...data });
  };

  const selectedType = form.watch("type");
  const thresholdUnit = selectedType === "ERROR_RATE" ? "%" : "ms";
  const thresholdPlaceholder = selectedType === "ERROR_RATE" ? "5" : "1000";

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create Alert</DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Alert Name</Label>
            <Input
              id="name"
              placeholder="High Error Rate"
              {...form.register("name")}
            />
            {form.formState.errors.name && (
              <p className="text-sm text-destructive">
                {form.formState.errors.name.message}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="type">Metric Type</Label>
              <Select
                value={form.watch("type")}
                onValueChange={(value) => form.setValue("type", value as FormData["type"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALERT_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="operator">Condition</Label>
              <Select
                value={form.watch("operator")}
                onValueChange={(value) => form.setValue("operator", value as FormData["operator"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GREATER_THAN">Greater than</SelectItem>
                  <SelectItem value="LESS_THAN">Less than</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="threshold">Threshold ({thresholdUnit})</Label>
            <Input
              id="threshold"
              type="number"
              step="0.01"
              placeholder={thresholdPlaceholder}
              {...form.register("threshold")}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="windowMins">Evaluation Window</Label>
              <Select
                value={String(form.watch("windowMins"))}
                onValueChange={(value) => form.setValue("windowMins", parseInt(value))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WINDOW_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cooldownMins">Cooldown Period</Label>
              <Select
                value={String(form.watch("cooldownMins"))}
                onValueChange={(value) => form.setValue("cooldownMins", parseInt(value))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COOLDOWN_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : "Create Alert"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

### 3.6 Add Channel Modal

```tsx
// apps/web/src/components/settings/alerts/add-channel-modal.tsx

"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc/client";
import { toast } from "sonner";
import { Mail, MessageSquare } from "lucide-react";

const PROVIDERS = [
  { value: "GMAIL", label: "Gmail", icon: Mail, description: "Send alerts via email" },
  { value: "DISCORD", label: "Discord", icon: MessageSquare, description: "Send alerts to Discord channel" },
];

const gmailSchema = z.object({
  provider: z.literal("GMAIL"),
  email: z.string().email("Invalid email address"),
});

const discordSchema = z.object({
  provider: z.literal("DISCORD"),
  webhookUrl: z
    .string()
    .url("Invalid URL")
    .startsWith("https://discord.com/api/webhooks/", "Must be a Discord webhook URL"),
});

type GmailForm = z.infer<typeof gmailSchema>;
type DiscordForm = z.infer<typeof discordSchema>;

interface AddChannelModalProps {
  alertId: string;
  open: boolean;
  onClose: () => void;
}

export function AddChannelModal({ alertId, open, onClose }: AddChannelModalProps) {
  const [provider, setProvider] = useState<"GMAIL" | "DISCORD">("GMAIL");

  const utils = trpc.useUtils();
  const addMutation = trpc.alerts.addChannel.useMutation({
    onSuccess: () => {
      utils.alerts.get.invalidate({ id: alertId });
      utils.alerts.list.invalidate();
      toast.success("Notification channel added");
      onClose();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const gmailForm = useForm<GmailForm>({
    resolver: zodResolver(gmailSchema),
    defaultValues: { provider: "GMAIL", email: "" },
  });

  const discordForm = useForm<DiscordForm>({
    resolver: zodResolver(discordSchema),
    defaultValues: { provider: "DISCORD", webhookUrl: "" },
  });

  const handleProviderChange = (value: "GMAIL" | "DISCORD") => {
    setProvider(value);
  };

  const handleSubmit = (data: GmailForm | DiscordForm) => {
    addMutation.mutate({
      alertId,
      provider: data.provider,
      config: data.provider === "GMAIL" ? { email: (data as GmailForm).email } : { webhookUrl: (data as DiscordForm).webhookUrl },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle>Add Notification Channel</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Provider</Label>
            <Select value={provider} onValueChange={handleProviderChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDERS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    <div className="flex items-center gap-2">
                      <p.icon className="h-4 w-4" />
                      {p.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              {PROVIDERS.find((p) => p.value === provider)?.description}
            </p>
          </div>

          {provider === "GMAIL" && (
            <form onSubmit={gmailForm.handleSubmit(handleSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="alerts@yourcompany.com"
                  {...gmailForm.register("email")}
                />
                {gmailForm.formState.errors.email && (
                  <p className="text-sm text-destructive">
                    {gmailForm.formState.errors.email.message}
                  </p>
                )}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={addMutation.isPending}>
                  {addMutation.isPending ? "Adding..." : "Add Channel"}
                </Button>
              </DialogFooter>
            </form>
          )}

          {provider === "DISCORD" && (
            <form onSubmit={discordForm.handleSubmit(handleSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="webhookUrl">Webhook URL</Label>
                <Input
                  id="webhookUrl"
                  type="url"
                  placeholder="https://discord.com/api/webhooks/..."
                  {...discordForm.register("webhookUrl")}
                />
                {discordForm.formState.errors.webhookUrl && (
                  <p className="text-sm text-destructive">
                    {discordForm.formState.errors.webhookUrl.message}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Create a webhook in your Discord server settings under Integrations
                </p>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={addMutation.isPending}>
                  {addMutation.isPending ? "Adding..." : "Add Channel"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

### 3.7 Alert History Page

```tsx
// apps/web/src/app/workspace/[workspaceSlug]/project/[projectId]/settings/alerts/[alertId]/history/page.tsx

"use client";

import { use } from "react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";

interface AlertHistoryPageProps {
  params: Promise<{
    workspaceSlug: string;
    projectId: string;
    alertId: string;
  }>;
}

export default function AlertHistoryPage({ params }: AlertHistoryPageProps) {
  const { workspaceSlug, projectId, alertId } = use(params);

  const { data: alert } = trpc.alerts.get.useQuery({ id: alertId });
  const {
    data: historyData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = trpc.alerts.history.useInfiniteQuery(
    { alertId, limit: 20 },
    { getNextPageParam: (lastPage) => lastPage.nextCursor }
  );

  const allHistory = historyData?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/workspace/${workspaceSlug}/project/${projectId}/settings/alerts`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold">
            Alert History: {alert?.name ?? "Loading..."}
          </h1>
          <p className="text-muted-foreground">
            View past triggers for this alert
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Trigger History</CardTitle>
        </CardHeader>
        <CardContent>
          {allHistory.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No triggers yet
            </p>
          ) : (
            <div className="space-y-4">
              {allHistory.map((item) => (
                <HistoryItem key={item.id} item={item} alertType={alert?.type} />
              ))}

              {hasNextPage && (
                <div className="text-center pt-4">
                  <Button
                    variant="outline"
                    onClick={() => fetchNextPage()}
                    disabled={isFetchingNextPage}
                  >
                    {isFetchingNextPage ? "Loading..." : "Load More"}
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
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
  };
  alertType?: string;
}

function HistoryItem({ item, alertType }: HistoryItemProps) {
  const isErrorRate = alertType === "ERROR_RATE";
  const valueDisplay = isErrorRate
    ? `${item.value.toFixed(2)}%`
    : `${item.value.toFixed(0)}ms`;
  const thresholdDisplay = isErrorRate
    ? `${item.threshold}%`
    : `${item.threshold}ms`;

  return (
    <div className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-destructive">{valueDisplay}</span>
          <span className="text-muted-foreground">exceeded threshold of</span>
          <span className="font-medium">{thresholdDisplay}</span>
        </div>
        <div className="text-sm text-muted-foreground">
          {formatDistanceToNow(new Date(item.triggeredAt), { addSuffix: true })}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {item.notifiedVia.map((provider) => (
          <Badge key={provider} variant="outline">
            {provider}
          </Badge>
        ))}
        {item.resolved ? (
          <Badge variant="secondary">Resolved</Badge>
        ) : (
          <Badge variant="destructive">Active</Badge>
        )}
      </div>
    </div>
  );
}
```

---

## 4. Settings Navigation Update

```tsx
// apps/web/src/app/workspace/[workspaceSlug]/project/[projectId]/settings/layout.tsx

// Add to navigation items
const NAV_ITEMS = [
  // ... existing items
  { title: "Alerts", href: "alerts", icon: Bell },
];
```

---

## 5. File Structure

```
apps/web/src/
├── app/
│   └── workspace/[workspaceSlug]/project/[projectId]/settings/
│       ├── alerts/
│       │   ├── page.tsx                    # Alerts list page
│       │   └── [alertId]/
│       │       └── history/
│       │           └── page.tsx            # Alert history page
│       └── layout.tsx                      # MODIFY: Add alerts nav
│
├── components/
│   └── settings/
│       └── alerts/
│           ├── alerts-header.tsx           # Header with create button
│           ├── alerts-list.tsx             # List of alert cards
│           ├── alerts-skeleton.tsx         # Loading skeleton
│           ├── alert-card.tsx              # Individual alert card
│           ├── create-alert-modal.tsx      # Create alert form
│           ├── edit-alert-modal.tsx        # Edit alert form
│           ├── delete-alert-dialog.tsx     # Delete confirmation
│           ├── add-channel-modal.tsx       # Add notification channel
│           └── channel-list.tsx            # List of channels in modal
```

---

## 6. Definition of Done

- [ ] Alerts settings page with list view
- [ ] Create alert modal with all form fields
- [ ] Edit alert modal
- [ ] Delete alert confirmation dialog
- [ ] Toggle alert enabled/disabled
- [ ] Add channel modal (Gmail + Discord)
- [ ] Test channel button sends test notification
- [ ] Alert history page with pagination
- [ ] Channel badges show verified status
- [ ] Trigger count badge on alert cards
- [ ] Settings navigation updated with Alerts link
- [ ] All components use shadcn/ui
- [ ] Responsive design for mobile
- [ ] Loading states and skeletons
- [ ] Error handling with toast notifications
