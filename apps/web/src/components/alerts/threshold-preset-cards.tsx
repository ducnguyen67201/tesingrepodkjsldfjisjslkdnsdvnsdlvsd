"use client";

import { useCallback } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ThresholdPresetSchema,
  THRESHOLD_PRESETS,
  PRESET_LABELS,
  type ThresholdPreset,
  type AlertType,
} from "@ducsigr/api/schemas";

interface ThresholdPresetCardsProps {
  selectedPreset: ThresholdPreset | null;
  alertType: AlertType;
  onSelectPreset: (preset: ThresholdPreset) => void;
}

const PRESET_DESCRIPTIONS: Record<ThresholdPreset, string> = {
  AGGRESSIVE: "Quick detection, more alerts. Best for dev/staging.",
  BALANCED: "Recommended for most production environments.",
  CONSERVATIVE: "Reduce noise for high-traffic systems.",
};

const PRESET_OPTIONS = ThresholdPresetSchema.options.map((value) => ({
  value,
  label: PRESET_LABELS[value],
  description: PRESET_DESCRIPTIONS[value],
  thresholds: THRESHOLD_PRESETS[value],
}));

export function ThresholdPresetCards({
  selectedPreset,
  alertType,
  onSelectPreset,
}: ThresholdPresetCardsProps) {
  const getThresholdForType = useCallback(
    (preset: ThresholdPreset): number => {
      const thresholds = THRESHOLD_PRESETS[preset];
      switch (alertType) {
        case "ERROR_RATE":
          return thresholds.errorRate;
        case "LATENCY_P50":
          return thresholds.latencyP50;
        case "LATENCY_P95":
          return thresholds.latencyP95;
        case "LATENCY_P99":
          return thresholds.latencyP99;
        default:
          return thresholds.errorRate;
      }
    },
    [alertType]
  );

  const unit = alertType === "ERROR_RATE" ? "%" : "ms";

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Quick Presets</p>
      <div className="grid grid-cols-3 gap-2">
        {PRESET_OPTIONS.map((preset) => {
          const threshold = getThresholdForType(preset.value);
          const isSelected = selectedPreset === preset.value;

          const handleClick = () => onSelectPreset(preset.value);

          return (
            <button
              key={preset.value}
              type="button"
              onClick={handleClick}
              className={cn(
                "relative rounded-lg border p-3 text-left transition-all",
                "hover:border-primary/50 hover:bg-accent/50",
                isSelected
                  ? "border-primary bg-accent"
                  : "border-border"
              )}
            >
              {isSelected && (
                <div className="absolute top-2 right-2">
                  <Check className="h-4 w-4 text-primary" />
                </div>
              )}
              <p className="font-medium text-sm">{preset.label}</p>
              <p className="text-lg font-bold text-primary">
                {threshold}
                {unit}
              </p>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {preset.description}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface PresetSummaryProps {
  alertType: AlertType;
}

export function PresetSummary({ alertType }: PresetSummaryProps) {
  const unit = alertType === "ERROR_RATE" ? "%" : "ms";

  return (
    <div className="text-xs text-muted-foreground space-y-1 p-3 bg-muted/50 rounded-lg">
      <p className="font-medium">Preset Thresholds:</p>
      <div className="grid grid-cols-3 gap-2">
        {PRESET_OPTIONS.map((preset) => {
          const threshold =
            alertType === "ERROR_RATE"
              ? preset.thresholds.errorRate
              : alertType === "LATENCY_P50"
              ? preset.thresholds.latencyP50
              : alertType === "LATENCY_P95"
              ? preset.thresholds.latencyP95
              : preset.thresholds.latencyP99;

          return (
            <div key={preset.value}>
              <span className="font-medium">{preset.label}:</span>{" "}
              {threshold}
              {unit}
            </div>
          );
        })}
      </div>
    </div>
  );
}
