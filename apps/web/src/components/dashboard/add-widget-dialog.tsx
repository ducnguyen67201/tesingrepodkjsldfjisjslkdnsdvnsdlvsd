"use client";

import { useCallback, useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { BarChart3, LineChart, PieChart, Table2, Activity, TrendingUp } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type {
  WidgetType,
  GraphDataSource,
  MetricOp,
  Unit,
  GraphQuery,
  GraphDisplay,
  WidgetLayout,
} from "@cognobserve/api/schemas";

// ============================================================
// Types
// ============================================================

interface AddWidgetDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (widget: {
    title: string;
    type: WidgetType;
    query: GraphQuery;
    display: GraphDisplay;
    layout: WidgetLayout;
  }) => void;
  isSaving?: boolean;
  existingWidgetCount: number;
}

interface FormValues {
  title: string;
  type: WidgetType;
  source: GraphDataSource;
  op: MetricOp;
  unit: Unit;
  showLegend: boolean;
  stacked: boolean;
}

// ============================================================
// Constants
// ============================================================

const WIDGET_TYPES: Array<{
  value: WidgetType;
  label: string;
  icon: typeof LineChart;
  description: string;
}> = [
  { value: "stat", label: "Stat Card", icon: TrendingUp, description: "Value + sparkline" },
  { value: "line", label: "Line Chart", icon: LineChart, description: "Time series data" },
  { value: "area", label: "Area Chart", icon: Activity, description: "Filled time series" },
  { value: "bar", label: "Bar Chart", icon: BarChart3, description: "Compare values" },
  { value: "donut", label: "Donut Chart", icon: PieChart, description: "Proportions" },
  { value: "single", label: "Single Value", icon: Activity, description: "One metric" },
  { value: "table", label: "Table", icon: Table2, description: "Detailed data" },
];

const DATA_SOURCES: Array<{ value: GraphDataSource; label: string; description: string }> = [
  { value: "trace", label: "Traces", description: "Top-level requests" },
  { value: "span", label: "Spans", description: "Individual operations" },
  { value: "log", label: "Logs", description: "Log records" },
];

const METRIC_OPS: Array<{ value: MetricOp; label: string; description: string }> = [
  { value: "count", label: "Count", description: "Total number" },
  { value: "avg", label: "Average", description: "Mean value" },
  { value: "sum", label: "Sum", description: "Total sum" },
  { value: "p50", label: "P50", description: "Median" },
  { value: "p95", label: "P95", description: "95th percentile" },
  { value: "p99", label: "P99", description: "99th percentile" },
  { value: "error_rate", label: "Error Rate", description: "Percentage of errors" },
  { value: "rate", label: "Rate", description: "Per-second rate" },
];

const UNITS: Array<{ value: Unit; label: string }> = [
  { value: "count", label: "Count" },
  { value: "ms", label: "Milliseconds" },
  { value: "percent", label: "Percent" },
  { value: "usd", label: "USD" },
  { value: "tokens", label: "Tokens" },
];

const WIDGET_PRESETS: Array<{
  label: string;
  title: string;
  source: GraphDataSource;
  op: MetricOp;
  field?: string;
  type: WidgetType;
  unit: Unit;
  category?: "stat" | "chart";
}> = [
  // Stat Cards (compact metrics)
  { label: "Total Traces", title: "Total Traces", source: "trace", op: "count", type: "stat", unit: "count", category: "stat" },
  { label: "Error Rate", title: "Error Rate", source: "span", op: "error_rate", type: "stat", unit: "percent", category: "stat" },
  { label: "P95 Latency", title: "P95 Latency", source: "span", op: "p95", field: "durationMs", type: "stat", unit: "ms", category: "stat" },
  { label: "P50 Latency", title: "P50 Latency", source: "span", op: "p50", field: "durationMs", type: "stat", unit: "ms", category: "stat" },
  { label: "Avg Latency", title: "Avg Latency", source: "span", op: "avg", field: "durationMs", type: "stat", unit: "ms", category: "stat" },
  { label: "Total Cost", title: "Total Cost", source: "span", op: "sum", field: "totalCost", type: "stat", unit: "usd", category: "stat" },
  { label: "Total Tokens", title: "Total Tokens", source: "span", op: "sum", field: "totalTokens", type: "stat", unit: "tokens", category: "stat" },
  { label: "Total Logs", title: "Total Logs", source: "log", op: "count", type: "stat", unit: "count", category: "stat" },
  // Charts (time series)
  { label: "Trace Volume", title: "Trace Volume", source: "trace", op: "count", type: "line", unit: "count", category: "chart" },
  { label: "Latency Trend", title: "Latency Trend", source: "span", op: "p95", field: "durationMs", type: "line", unit: "ms", category: "chart" },
  { label: "Error Trend", title: "Error Trend", source: "span", op: "error_rate", type: "line", unit: "percent", category: "chart" },
  { label: "Log Volume", title: "Log Volume", source: "log", op: "count", type: "area", unit: "count", category: "chart" },
];

const DEFAULT_VALUES: FormValues = {
  title: "",
  type: "line",
  source: "trace",
  op: "count",
  unit: "count",
  showLegend: true,
  stacked: false,
};

// ============================================================
// Component
// ============================================================

export function AddWidgetDialog({
  open,
  onClose,
  onSave,
  isSaving = false,
  existingWidgetCount,
}: AddWidgetDialogProps) {
  const [step, setStep] = useState<"preset" | "custom">("preset");

  const form = useForm<FormValues>({
    defaultValues: DEFAULT_VALUES,
  });

  const selectedType = form.watch("type");

  // Calculate layout position for new widget
  const newWidgetLayout = useMemo((): WidgetLayout => {
    const col = existingWidgetCount % 3;
    const row = Math.floor(existingWidgetCount / 3);
    return { x: col * 4, y: row * 3, w: 4, h: 3 };
  }, [existingWidgetCount]);

  const handlePresetSelect = useCallback(
    (preset: (typeof WIDGET_PRESETS)[number]) => {
      const query: GraphQuery = {
        source: preset.source,
        metric: preset.op,
        op: preset.op,
        field: preset.field,
        timeRange: "24h",
        bucket: "auto",
      };

      const display: GraphDisplay = {
        unit: preset.unit,
        decimals: 2,
        showLegend: true,
        stacked: false,
        sparkline: false,
      };

      onSave({
        title: preset.title,
        type: preset.type,
        query,
        display,
        layout: newWidgetLayout,
      });
    },
    [onSave, newWidgetLayout]
  );

  const handleSubmit = useCallback(
    (values: FormValues) => {
      const query: GraphQuery = {
        source: values.source,
        metric: values.op,
        op: values.op,
        timeRange: "24h",
        bucket: "auto",
      };

      const display: GraphDisplay = {
        unit: values.unit,
        decimals: 2,
        showLegend: values.showLegend,
        stacked: values.stacked,
        sparkline: false,
      };

      onSave({
        title: values.title,
        type: values.type,
        query,
        display,
        layout: newWidgetLayout,
      });
    },
    [onSave, newWidgetLayout]
  );

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        form.reset();
        setStep("preset");
        onClose();
      }
    },
    [form, onClose]
  );

  const handleFormSubmit = form.handleSubmit(handleSubmit);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Add Widget</DialogTitle>
          <DialogDescription>
            {step === "preset"
              ? "Choose a preset or create a custom widget."
              : "Configure your custom widget."}
          </DialogDescription>
        </DialogHeader>

        {step === "preset" ? (
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            {/* Stat Cards Section */}
            <div className="space-y-2">
              <div className="text-sm font-medium">Stat Cards</div>
              <div className="grid grid-cols-4 gap-2">
                {WIDGET_PRESETS.filter((p) => p.category === "stat").map((preset) => (
                  <Button
                    key={preset.label}
                    variant="outline"
                    className="h-auto flex-col items-start p-2 text-left"
                    onClick={() => handlePresetSelect(preset)}
                    disabled={isSaving}
                  >
                    <span className="text-xs font-medium">{preset.label}</span>
                  </Button>
                ))}
              </div>
            </div>

            {/* Charts Section */}
            <div className="space-y-2">
              <div className="text-sm font-medium">Charts</div>
              <div className="grid grid-cols-2 gap-2">
                {WIDGET_PRESETS.filter((p) => p.category === "chart").map((preset) => (
                  <Button
                    key={preset.label}
                    variant="outline"
                    className="h-auto flex-col items-start p-3 text-left"
                    onClick={() => handlePresetSelect(preset)}
                    disabled={isSaving}
                  >
                    <span className="font-medium">{preset.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {preset.source} &middot; {preset.op}
                    </span>
                  </Button>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">Or</span>
              </div>
            </div>

            <Button
              variant="secondary"
              className="w-full"
              onClick={() => setStep("custom")}
            >
              Create Custom Widget
            </Button>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={handleFormSubmit} className="space-y-4">
              <FormField
                control={form.control}
                name="title"
                rules={{ required: "Title is required" }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input placeholder="My Widget" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Chart Type</FormLabel>
                    <div className="grid grid-cols-3 gap-2">
                      {WIDGET_TYPES.map((widgetType) => {
                        const Icon = widgetType.icon;
                        return (
                          <button
                            key={widgetType.value}
                            type="button"
                            onClick={() => field.onChange(widgetType.value)}
                            className={cn(
                              "flex flex-col items-center gap-1 rounded-lg border p-3 text-center transition-colors hover:bg-accent",
                              field.value === widgetType.value && "border-primary bg-accent"
                            )}
                          >
                            <Icon className="h-5 w-5" />
                            <span className="text-xs font-medium">{widgetType.label}</span>
                          </button>
                        );
                      })}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="source"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Data Source</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select source" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {DATA_SOURCES.map((source) => (
                            <SelectItem key={source.value} value={source.value}>
                              {source.label}
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
                  name="op"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Metric</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select metric" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {METRIC_OPS.map((op) => (
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
              </div>

              <FormField
                control={form.control}
                name="unit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Display Unit</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select unit" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {UNITS.map((unit) => (
                          <SelectItem key={unit.value} value={unit.value}>
                            {unit.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex items-center gap-6">
                <FormField
                  control={form.control}
                  name="showLegend"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-2">
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                      <FormLabel className="!mt-0">Show Legend</FormLabel>
                    </FormItem>
                  )}
                />

                {(selectedType === "area" || selectedType === "bar") && (
                  <FormField
                    control={form.control}
                    name="stacked"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-2">
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                        <FormLabel className="!mt-0">Stacked</FormLabel>
                      </FormItem>
                    )}
                  />
                )}
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setStep("preset")}>
                  Back
                </Button>
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? "Adding..." : "Add Widget"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}

        {step === "preset" && (
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
