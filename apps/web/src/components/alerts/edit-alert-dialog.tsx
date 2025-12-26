"use client";

import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { ChevronDown, ChevronUp } from "lucide-react";
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
import { trpc } from "@/lib/trpc/client";
import { showError } from "@/lib/errors";
import { alertToast } from "@/lib/success";
import {
  AlertTypeSchema,
  ALERT_TYPE_LABELS,
  THRESHOLD_PRESETS,
  type AlertType,
  type AlertSeverity,
} from "@ducsigr/api/schemas";
import { SeveritySelector } from "./severity-selector";
import { ThresholdPresetCards } from "./threshold-preset-cards";
import type { ThresholdPreset } from "@ducsigr/api/schemas";

interface EditAlertDialogProps {
  workspaceSlug: string;
  alert: {
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

interface EditAlertFormValues {
  name: string;
  type: AlertType;
  threshold: string;
  operator: "GREATER_THAN" | "LESS_THAN";
  windowMins: string;
  cooldownMins: string;
  severity: AlertSeverity;
  pendingMins: string;
}

export function EditAlertDialog({
  workspaceSlug,
  alert,
  open,
  onClose,
}: EditAlertDialogProps) {
  const utils = trpc.useUtils();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<ThresholdPreset | null>(null);

  const form = useForm<EditAlertFormValues>({
    defaultValues: {
      name: alert.name,
      type: alert.type,
      threshold: alert.threshold.toString(),
      operator: alert.operator,
      windowMins: alert.windowMins.toString(),
      cooldownMins: alert.cooldownMins.toString(),
      severity: alert.severity,
      pendingMins: alert.pendingMins.toString(),
    },
  });

  // Reset form when alert changes
  useEffect(() => {
    if (open) {
      form.reset({
        name: alert.name,
        type: alert.type,
        threshold: alert.threshold.toString(),
        operator: alert.operator,
        windowMins: alert.windowMins.toString(),
        cooldownMins: alert.cooldownMins.toString(),
        severity: alert.severity,
        pendingMins: alert.pendingMins.toString(),
      });
      setSelectedPreset(null);
    }
  }, [alert, open, form]);

  const updateMutation = trpc.alerts.update.useMutation({
    onSuccess: (_, variables) => {
      utils.alerts.list.invalidate();
      alertToast.updated(variables.name);
      onClose();
    },
    onError: (error) => {
      showError(error);
    },
  });

  const handleSubmit = useCallback(
    (values: EditAlertFormValues) => {
      const threshold = parseFloat(values.threshold);
      const windowMins = parseInt(values.windowMins, 10);
      const cooldownMins = values.cooldownMins ? parseInt(values.cooldownMins, 10) : undefined;
      const pendingMins = values.pendingMins ? parseInt(values.pendingMins, 10) : undefined;

      if (isNaN(threshold) || threshold < 0) {
        form.setError("threshold", { message: "Must be a positive number" });
        return;
      }
      if (isNaN(windowMins) || windowMins < 1 || windowMins > 60) {
        form.setError("windowMins", { message: "Must be 1-60" });
        return;
      }
      if (cooldownMins !== undefined && (isNaN(cooldownMins) || cooldownMins < 1 || cooldownMins > 1440)) {
        form.setError("cooldownMins", { message: "Must be 1-1440" });
        return;
      }
      if (pendingMins !== undefined && (isNaN(pendingMins) || pendingMins < 0 || pendingMins > 30)) {
        form.setError("pendingMins", { message: "Must be 0-30" });
        return;
      }

      updateMutation.mutate({
        workspaceSlug,
        id: alert.id,
        name: values.name,
        threshold,
        operator: values.operator,
        windowMins,
        cooldownMins,
        severity: values.severity,
        pendingMins,
      });
    },
    [updateMutation, workspaceSlug, alert.id, form]
  );

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        onClose();
      }
    },
    [onClose]
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
          <DialogTitle>Edit Alert</DialogTitle>
          <DialogDescription>
            Modify the alert configuration and thresholds.
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
                    <Select value={field.value} disabled>
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
                    <FormDescription className="text-xs">Cannot be changed</FormDescription>
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
                            min={1}
                            max={1440}
                            placeholder="Use severity default"
                            {...field}
                            value={field.value ?? ""}
                          />
                        </FormControl>
                        <FormDescription>Min time between notifications</FormDescription>
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
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
