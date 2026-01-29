"use client";

import { useCallback } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  AlertSeveritySchema,
  SEVERITY_DEFAULTS,
  SEVERITY_LABELS,
  type AlertSeverity,
} from "@ducsigr/api/schemas";

interface SeveritySelectorProps {
  value: AlertSeverity;
  onValueChange: (value: AlertSeverity) => void;
  showDefaults?: boolean;
  disabled?: boolean;
}

const SEVERITY_COLORS: Record<AlertSeverity, string> = {
  CRITICAL: "bg-red-500/10 text-red-600 border-red-500/20",
  HIGH: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  MEDIUM: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  LOW: "bg-blue-500/10 text-blue-600 border-blue-500/20",
};

const SEVERITY_OPTIONS = AlertSeveritySchema.options.map((value) => ({
  value,
  label: SEVERITY_LABELS[value],
  defaults: SEVERITY_DEFAULTS[value],
}));

export function SeveritySelector({
  value,
  onValueChange,
  showDefaults = true,
  disabled = false,
}: SeveritySelectorProps) {
  const handleValueChange = useCallback(
    (newValue: string) => {
      onValueChange(newValue as AlertSeverity);
    },
    [onValueChange]
  );

  const selectedDefaults = SEVERITY_DEFAULTS[value];

  return (
    <div className="space-y-2">
      <Select value={value} onValueChange={handleValueChange} disabled={disabled}>
        <SelectTrigger>
          <SelectValue placeholder="Select severity">
            {value && (
              <div className="flex items-center gap-2">
                <SeverityBadge severity={value} />
              </div>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {SEVERITY_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              <div className="flex items-center gap-2">
                <SeverityBadge severity={option.value} />
                <span className="text-xs text-muted-foreground">
                  ({option.defaults.cooldownMins}min cooldown)
                </span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {showDefaults && (
        <div className="text-xs text-muted-foreground space-y-1">
          <p>
            Pending: {selectedDefaults.pendingMins} min before firing
          </p>
          <p>
            Cooldown: {selectedDefaults.cooldownMins} min between notifications
          </p>
        </div>
      )}
    </div>
  );
}

interface SeverityBadgeProps {
  severity: AlertSeverity;
  className?: string;
}

export function SeverityBadge({ severity, className }: SeverityBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(SEVERITY_COLORS[severity], className)}
    >
      {SEVERITY_LABELS[severity]}
    </Badge>
  );
}
