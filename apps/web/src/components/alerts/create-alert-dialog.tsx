"use client";

import { useCallback, useState } from "react";
import { useForm } from "react-hook-form";
import { ChevronDown, ChevronUp, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc/client";
import { showError } from "@/lib/errors";
import { alertToast } from "@/lib/success";
import {
  AlertTypeSchema,
  ALERT_TYPE_LABELS,
  THRESHOLD_PRESETS,
  type AlertType,
  type AlertSeverity,
  type ThresholdPreset,
} from "@ducsigr/api/schemas";
import { SeveritySelector } from "./severity-selector";
import { ThresholdPresetCards } from "./threshold-preset-cards";

interface CreateAlertDialogProps {
  workspaceSlug: string;
  projectId: string;
  open: boolean;
  onClose: () => void;
}

const ALERT_TYPE_UNITS: Record<AlertType, string> = {
  ERROR_RATE: "%",
  LATENCY_P50: "ms",
  LATENCY_P95: "ms",
  LATENCY_P99: "ms",
};

const ALERT_TYPES = AlertTypeSchema.options.map((value) => ({
  value,
  label: ALERT_TYPE_LABELS[value],
  unit: ALERT_TYPE_UNITS[value],
}));

const OPERATORS = [
  { value: "GREATER_THAN", label: "Greater than (>)" },
  { value: "LESS_THAN", label: "Less than (<)" },
] as const;

interface CreateAlertFormValues {
  name: string;
  type: AlertType;
  threshold: string;
  operator: "GREATER_THAN" | "LESS_THAN";
  windowMins: string;
  cooldownMins: string;
  severity: AlertSeverity;
  pendingMins: string;
}

const DEFAULT_VALUES: CreateAlertFormValues = {
  name: "",
  type: "ERROR_RATE",
  threshold: "5",
  operator: "GREATER_THAN",
  windowMins: "5",
  cooldownMins: "",
  severity: "MEDIUM",
  pendingMins: "",
};

export function CreateAlertDialog({
  workspaceSlug,
  projectId,
  open,
  onClose,
}: CreateAlertDialogProps) {
  const utils = trpc.useUtils();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [instantAlerting, setInstantAlerting] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<ThresholdPreset | null>("BALANCED");
  const form = useForm<CreateAlertFormValues>({
    defaultValues: DEFAULT_VALUES,
  });

  const createMutation = trpc.alerts.create.useMutation({
    onSuccess: (_, variables) => {
      utils.alerts.list.invalidate();
      alertToast.created(variables.name);
      form.reset();
      onClose();
    },
    onError: (error) => {
      showError(error);
    },
  });

  const handleInstantToggle = useCallback(
    (checked: boolean) => {
      setInstantAlerting(checked);
      if (checked) {
        form.setValue("cooldownMins", "0");
        form.setValue("pendingMins", "0");
        form.setValue("severity", "CRITICAL");
      } else {
        form.setValue("cooldownMins", "");
        form.setValue("pendingMins", "");
      }
    },
    [form]
  );

  const handleSubmit = useCallback(
    (values: CreateAlertFormValues) => {
      const threshold = parseFloat(values.threshold);
      const windowMins = parseInt(values.windowMins, 10);
      const cooldownMins = values.cooldownMins !== "" ? parseInt(values.cooldownMins, 10) : undefined;
      const pendingMins = values.pendingMins !== "" ? parseInt(values.pendingMins, 10) : undefined;

      if (isNaN(threshold) || threshold < 0) {
        form.setError("threshold", { message: "Must be a positive number" });
        return;
      }
      if (isNaN(windowMins) || windowMins < 1 || windowMins > 60) {
        form.setError("windowMins", { message: "Must be 1-60" });
        return;
      }
      if (cooldownMins !== undefined && (isNaN(cooldownMins) || cooldownMins < 0 || cooldownMins > 1440)) {
        form.setError("cooldownMins", { message: "Must be 0-1440 (0 = no cooldown)" });
        return;
      }
      if (pendingMins !== undefined && (isNaN(pendingMins) || pendingMins < 0 || pendingMins > 30)) {
        form.setError("pendingMins", { message: "Must be 0-30" });
        return;
      }

      createMutation.mutate({
        workspaceSlug,
        projectId,
        name: values.name,
        type: values.type,
        operator: values.operator,
        threshold,
        windowMins,
        cooldownMins,
        severity: values.severity,
        pendingMins,
      });
    },
    [createMutation, workspaceSlug, projectId, form]
  );

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        form.reset();
        setSelectedPreset("BALANCED");
        setShowAdvanced(false);
        setInstantAlerting(false);
        onClose();
      }
    },
    [form, onClose]
  );

  const handlePresetSelect = useCallback(
    (preset: ThresholdPreset) => {
      setSelectedPreset(preset);
      const alertType = form.getValues("type");
      const thresholds = THRESHOLD_PRESETS[preset];
      const threshold =
        alertType === "ERROR_RATE"
          ? thresholds.errorRate
          : alertType === "LATENCY_P50"
          ? thresholds.latencyP50
          : alertType === "LATENCY_P95"
          ? thresholds.latencyP95
          : thresholds.latencyP99;
      form.setValue("threshold", threshold.toString());
    },
    [form]
  );

  const handleSeverityChange = useCallback(
    (severity: AlertSeverity) => {
      form.setValue("severity", severity);
    },
    [form]
  );

  const handleFormSubmit = form.handleSubmit(handleSubmit);

  const selectedType = form.watch("type");
  const selectedSeverity = form.watch("severity");
  const unit = ALERT_TYPES.find((t) => t.value === selectedType)?.unit ?? "";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create Alert</DialogTitle>
          <DialogDescription>
            Set up an alert to get notified when a metric exceeds your threshold.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={handleFormSubmit} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Alert Name</FormLabel>
                  <FormControl>
                    <Input placeholder="High Error Rate" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Metric Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select metric type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {ALERT_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="severity"
                render={() => (
                  <FormItem>
                    <FormLabel>Severity</FormLabel>
                    <SeveritySelector
                      value={selectedSeverity}
                      onValueChange={handleSeverityChange}
                      showDefaults={false}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <ThresholdPresetCards
              selectedPreset={selectedPreset}
              alertType={selectedType}
              onSelectPreset={handlePresetSelect}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="operator"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Condition</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select condition" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {OPERATORS.map((op) => (
                          <SelectItem key={op.value} value={op.value}>
                            {op.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="threshold"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Threshold ({unit})</FormLabel>
                    <FormControl>
                      <Input type="number" step="any" {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="windowMins"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Time Window (minutes)</FormLabel>
                  <FormControl>
                    <Input type="number" min={1} max={60} {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormDescription>Evaluate metrics over this window (1-60 minutes)</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Instant Alerting Toggle */}
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-500" />
                <div className="space-y-0.5">
                  <Label htmlFor="instant-alerting" className="text-sm font-medium cursor-pointer">
                    Instant Alerting
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    No cooldown, no pending delay. Alert fires immediately on every eval cycle.
                  </p>
                </div>
              </div>
              <Switch
                id="instant-alerting"
                checked={instantAlerting}
                onCheckedChange={handleInstantToggle}
              />
            </div>

            <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" type="button" className="w-full justify-between">
                  Advanced Settings
                  {showAdvanced ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 pt-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="pendingMins"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Pending Duration (minutes)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={0}
                            max={30}
                            placeholder="Use severity default"
                            disabled={instantAlerting}
                            {...field}
                            value={field.value ?? ""}
                          />
                        </FormControl>
                        <FormDescription>Condition must persist before firing</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="cooldownMins"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cooldown (minutes)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={0}
                            max={1440}
                            placeholder="Use severity default"
                            disabled={instantAlerting}
                            {...field}
                            value={field.value ?? ""}
                          />
                        </FormControl>
                        <FormDescription>Min time between notifications (0 = instant)</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating..." : "Create Alert"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
