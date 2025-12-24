"use client";

import { useState, useCallback, memo } from "react";
import {
  MoreVertical,
  Trash2,
  Settings,
  Download,
  Check,
  Palette,
  Webhook,
  Shield,
  Plug,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import {
  type ExtensionType,
  EXTENSION_TYPE_LABELS,
} from "@cognobserve/api/schemas";

// ============================================================================
// Constants
// ============================================================================

const TYPE_ICONS: Record<ExtensionType, React.ReactNode> = {
  THEME: <Palette className="h-4 w-4" />,
  INGESTION: <Plug className="h-4 w-4" />,
  POLICY: <Shield className="h-4 w-4" />,
  WEBHOOK: <Webhook className="h-4 w-4" />,
};

const TYPE_COLORS: Record<ExtensionType, string> = {
  THEME: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  INGESTION: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  POLICY: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  WEBHOOK: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
};

// ============================================================================
// Types
// ============================================================================

interface ExtensionCardProps {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  type: ExtensionType;
  latestVersion: string | null;
  isInstalled: boolean;
  installId?: string;
  enabled?: boolean;
  onInstall: (extensionId: string) => void;
  onConfigure: (extensionId: string, installId: string) => void;
  onToggle: (installId: string, enabled: boolean) => Promise<void>;
  onUninstall: (installId: string) => Promise<void>;
  isToggling?: boolean;
  isUninstalling?: boolean;
}

// ============================================================================
// Component
// ============================================================================

export const ExtensionCard = memo(function ExtensionCard({
  id,
  name,
  description,
  type,
  latestVersion,
  isInstalled,
  installId,
  enabled = false,
  onInstall,
  onConfigure,
  onToggle,
  onUninstall,
  isToggling,
  isUninstalling,
}: ExtensionCardProps) {
  const [showUninstallDialog, setShowUninstallDialog] = useState(false);

  const handleToggle = useCallback(async () => {
    if (installId) {
      await onToggle(installId, !enabled);
    }
  }, [onToggle, installId, enabled]);

  const handleUninstall = useCallback(async () => {
    if (installId) {
      await onUninstall(installId);
      setShowUninstallDialog(false);
    }
  }, [onUninstall, installId]);

  const handleInstall = useCallback(() => {
    onInstall(id);
  }, [onInstall, id]);

  const handleConfigure = useCallback(() => {
    if (installId) {
      onConfigure(id, installId);
    }
  }, [onConfigure, id, installId]);

  return (
    <>
      <Card className={cn(isInstalled && !enabled && "opacity-60")}>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">{name}</CardTitle>
                {isInstalled && (
                  <Badge variant="outline" className="gap-1 text-xs">
                    <Check className="h-3 w-3" />
                    Installed
                  </Badge>
                )}
              </div>
              {description && (
                <CardDescription className="text-sm line-clamp-2">
                  {description}
                </CardDescription>
              )}
            </div>
            <div className="flex items-center gap-2">
              {isInstalled ? (
                <>
                  <Switch
                    checked={enabled}
                    onCheckedChange={handleToggle}
                    disabled={isToggling}
                  />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={handleConfigure}>
                        <Settings className="mr-2 h-4 w-4" />
                        Configure
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => setShowUninstallDialog(true)}
                        className="text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Uninstall
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              ) : (
                <Button size="sm" onClick={handleInstall}>
                  <Download className="mr-2 h-4 w-4" />
                  Install
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Badge variant="secondary" className={cn("gap-1", TYPE_COLORS[type])}>
              {TYPE_ICONS[type]}
              {EXTENSION_TYPE_LABELS[type]}
            </Badge>
            {latestVersion && (
              <span className="text-xs">v{latestVersion}</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Uninstall confirmation dialog */}
      <AlertDialog open={showUninstallDialog} onOpenChange={setShowUninstallDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Uninstall extension?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove &ldquo;{name}&rdquo; from your workspace.
              Any configuration will be lost. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleUninstall}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isUninstalling}
            >
              {isUninstalling ? "Uninstalling..." : "Uninstall"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
});
