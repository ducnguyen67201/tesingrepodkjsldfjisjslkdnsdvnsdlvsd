"use client";

import { memo } from "react";
import { AlertTriangle, Shield, Check } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  type ExtensionPermission,
  PERMISSION_LABELS,
  PERMISSION_RISK,
} from "@ducsigr/api/schemas";

// ============================================================================
// Constants
// ============================================================================

const RISK_COLORS = {
  low: "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-900/20",
  medium: "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-900/20",
  high: "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-900/20",
};

const RISK_ICON_COLORS = {
  low: "text-green-600 dark:text-green-400",
  medium: "text-amber-600 dark:text-amber-400",
  high: "text-red-600 dark:text-red-400",
};

// ============================================================================
// Types
// ============================================================================

interface PermissionApprovalProps {
  permissions: ExtensionPermission[];
  approvedPermissions: ExtensionPermission[];
  onApprovalChange: (permission: ExtensionPermission, approved: boolean) => void;
  disabled?: boolean;
}

interface PermissionItemProps {
  permission: ExtensionPermission;
  isApproved: boolean;
  onToggle: (approved: boolean) => void;
  disabled?: boolean;
}

// ============================================================================
// Permission Item
// ============================================================================

const PermissionItem = memo(function PermissionItem({
  permission,
  isApproved,
  onToggle,
  disabled,
}: PermissionItemProps) {
  const risk = PERMISSION_RISK[permission];
  const label = PERMISSION_LABELS[permission];

  const handleChange = (checked: boolean | "indeterminate") => {
    if (typeof checked === "boolean") {
      onToggle(checked);
    }
  };

  return (
    <label
      className={cn(
        "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
        RISK_COLORS[risk],
        disabled && "opacity-60 cursor-not-allowed"
      )}
    >
      <Checkbox
        checked={isApproved}
        onCheckedChange={handleChange}
        disabled={disabled}
        className="mt-0.5"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {risk === "high" ? (
            <AlertTriangle className={cn("h-4 w-4", RISK_ICON_COLORS[risk])} />
          ) : risk === "medium" ? (
            <Shield className={cn("h-4 w-4", RISK_ICON_COLORS[risk])} />
          ) : (
            <Check className={cn("h-4 w-4", RISK_ICON_COLORS[risk])} />
          )}
          <span className="text-sm font-medium">{label}</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          <code className="text-[10px] bg-muted px-1 py-0.5 rounded">
            {permission}
          </code>
        </p>
      </div>
    </label>
  );
});

// ============================================================================
// Component
// ============================================================================

export const PermissionApproval = memo(function PermissionApproval({
  permissions,
  approvedPermissions,
  onApprovalChange,
  disabled,
}: PermissionApprovalProps) {
  if (permissions.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-4">
        This extension requires no special permissions.
      </div>
    );
  }

  // Sort permissions by risk level (high first)
  const sortedPermissions = [...permissions].sort((a, b) => {
    const riskOrder = { high: 0, medium: 1, low: 2 };
    return riskOrder[PERMISSION_RISK[a]] - riskOrder[PERMISSION_RISK[b]];
  });

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground mb-3">
        This extension requires the following permissions:
      </p>
      <div className="space-y-2">
        {sortedPermissions.map((permission) => (
          <PermissionItem
            key={permission}
            permission={permission}
            isApproved={approvedPermissions.includes(permission)}
            onToggle={(approved) => onApprovalChange(permission, approved)}
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  );
});
