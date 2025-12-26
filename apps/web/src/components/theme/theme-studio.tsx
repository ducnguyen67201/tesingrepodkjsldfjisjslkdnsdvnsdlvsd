"use client";

import { useState, useCallback, useMemo } from "react";
import { useTheme } from "@/hooks/use-theme";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Palette, RotateCcw, Save, Check, Sparkles } from "lucide-react";
import { ColorPicker } from "./color-picker";
import { ThemePreview } from "./theme-preview";
import {
  type WorkspaceThemeConfig,
  type AllowedCssVar,
  type AllowedFont,
  DEFAULT_CSS_VARS,
  DEFAULT_THEME,
} from "@ducsigr/api/schemas";

// ============================================================================
// Types
// ============================================================================

interface ThemeStudioProps {
  workspaceId: string;
}

// Local type for partial CSS vars (allows undefined values during editing)
type PartialCssVars = Partial<Record<AllowedCssVar, string>>;

// ============================================================================
// Constants
// ============================================================================

const PRIMARY_COLORS: AllowedCssVar[] = [
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "destructive-foreground",
];

const BACKGROUND_COLORS: AllowedCssVar[] = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "muted",
  "muted-foreground",
];

const UI_COLORS: AllowedCssVar[] = [
  "border",
  "input",
  "ring",
];

const CHART_COLORS: AllowedCssVar[] = [
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
];

const SIDEBAR_COLORS: AllowedCssVar[] = [
  "sidebar-background",
  "sidebar-foreground",
  "sidebar-primary",
  "sidebar-primary-foreground",
  "sidebar-accent",
  "sidebar-accent-foreground",
  "sidebar-border",
  "sidebar-ring",
];

const FONT_OPTIONS: { value: AllowedFont; label: string }[] = [
  { value: "system-ui", label: "System UI" },
  { value: "Inter", label: "Inter" },
  { value: "Roboto", label: "Roboto" },
  { value: "Arial", label: "Arial" },
  { value: "Helvetica Neue", label: "Helvetica Neue" },
  { value: "sans-serif", label: "Sans Serif" },
  { value: "serif", label: "Serif" },
  { value: "Georgia", label: "Georgia" },
  { value: "Fira Code", label: "Fira Code" },
  { value: "JetBrains Mono", label: "JetBrains Mono" },
  { value: "monospace", label: "Monospace" },
];

// ============================================================================
// Component
// ============================================================================

export function ThemeStudio({ workspaceId }: ThemeStudioProps) {
  const {
    activeTheme,
    installedThemes,
    presets,
    isLoading,
    setActive,
    saveConfig,
    isSettingActive,
    isSavingConfig,
  } = useTheme({ workspaceId });

  // Local state for editing
  const [editConfig, setEditConfig] = useState<WorkspaceThemeConfig | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  // Get working config (either editing or active)
  const workingConfig = useMemo(() => {
    if (editConfig) return editConfig;
    if (activeTheme?.config) return activeTheme.config;
    return DEFAULT_THEME;
  }, [editConfig, activeTheme?.config]);

  // Initialize edit config when switching to a theme
  const handleThemeSelect = useCallback(
    async (installId: string | null) => {
      await setActive(installId);
      setEditConfig(null);
      setHasChanges(false);
    },
    [setActive]
  );

  // Update CSS variable
  const handleColorChange = useCallback(
    (varName: AllowedCssVar, value: string) => {
      setEditConfig((prev) => {
        const base = prev ?? workingConfig;
        const existingVars = base.cssVars ?? {};
        const newCssVars: PartialCssVars = {
          ...existingVars,
          [varName]: value,
        };
        return {
          ...base,
          cssVars: newCssVars as WorkspaceThemeConfig["cssVars"],
        };
      });
      setHasChanges(true);
    },
    [workingConfig]
  );

  // Create color change handler for a specific variable (curried)
  const createColorChangeHandler = useCallback(
    (varName: AllowedCssVar) => (value: string) => {
      handleColorChange(varName, value);
    },
    [handleColorChange]
  );

  // Update font
  const handleFontChange = useCallback(
    (fontType: "body" | "heading" | "mono", value: AllowedFont | undefined) => {
      setEditConfig((prev) => {
        const base = prev ?? workingConfig;
        const newFonts = { ...base.fonts };
        if (value) {
          newFonts[fontType] = value;
        } else {
          delete newFonts[fontType];
        }
        return {
          ...base,
          fonts: Object.keys(newFonts).length > 0 ? newFonts : undefined,
        };
      });
      setHasChanges(true);
    },
    [workingConfig]
  );

  // Toggle dark mode base
  const handleDarkModeToggle = useCallback(
    (enabled: boolean) => {
      setEditConfig((prev) => {
        const base = prev ?? workingConfig;
        return {
          ...base,
          darkMode: enabled,
        };
      });
      setHasChanges(true);
    },
    [workingConfig]
  );

  // Apply preset
  const handleApplyPreset = useCallback(
    (presetKey: string) => {
      const preset = presets.find((p) => p.key === presetKey);
      if (preset) {
        setEditConfig(preset.config);
        setHasChanges(true);
      }
    },
    [presets]
  );

  // Reset to defaults
  const handleReset = useCallback(() => {
    setEditConfig(DEFAULT_THEME);
    setHasChanges(true);
  }, []);

  // Save changes
  const handleSave = useCallback(async () => {
    if (!activeTheme?.installId || !editConfig) return;
    await saveConfig(activeTheme.installId, editConfig);
    setEditConfig(null);
    setHasChanges(false);
  }, [activeTheme?.installId, editConfig, saveConfig]);

  // Get current value for a CSS variable
  const getVarValue = useCallback(
    (varName: AllowedCssVar): string => {
      return workingConfig.cssVars?.[varName] ?? DEFAULT_CSS_VARS[varName];
    },
    [workingConfig]
  );

  // Render color section
  const renderColorSection = useCallback(
    (title: string, vars: AllowedCssVar[]) => (
      <div className="space-y-3">
        <h3 className="text-sm font-medium">{title}</h3>
        <div className="grid grid-cols-2 gap-3">
          {vars.map((varName) => (
            <ColorPicker
              key={varName}
              label={varName.replace(/-/g, " ")}
              value={getVarValue(varName)}
              onChange={createColorChangeHandler(varName)}
            />
          ))}
        </div>
      </div>
    ),
    [getVarValue, createColorChangeHandler]
  );

  if (isLoading) {
    return <ThemeStudioSkeleton />;
  }

  const hasActiveTheme = !!activeTheme?.installId;
  const isBusy = isSettingActive || isSavingConfig;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Theme Studio
          </h2>
          <p className="text-sm text-muted-foreground">
            Customize your workspace appearance with colors and fonts.
          </p>
        </div>
        {hasActiveTheme && hasChanges && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              disabled={isBusy}
            >
              <RotateCcw className="h-4 w-4 mr-1" />
              Reset
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={isBusy}
            >
              {isSavingConfig ? (
                "Saving..."
              ) : (
                <>
                  <Save className="h-4 w-4 mr-1" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      {/* Theme Selector */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Active Theme</CardTitle>
          <CardDescription>
            Select a theme extension to customize or use the default.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Theme selection buttons */}
          <div className="flex flex-wrap gap-2">
            <Button
              variant={!hasActiveTheme ? "default" : "outline"}
              size="sm"
              onClick={() => handleThemeSelect(null)}
              disabled={isBusy}
            >
              {!hasActiveTheme && <Check className="h-4 w-4 mr-1" />}
              Default Theme
            </Button>
            {installedThemes.map((theme) => (
              <Button
                key={theme.id}
                variant={activeTheme?.installId === theme.id ? "default" : "outline"}
                size="sm"
                onClick={() => handleThemeSelect(theme.id)}
                disabled={isBusy}
              >
                {activeTheme?.installId === theme.id && <Check className="h-4 w-4 mr-1" />}
                {theme.extensionName}
              </Button>
            ))}
          </div>

          {installedThemes.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No theme extensions installed. Install a theme extension from the Extensions Hub to enable customization.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Editor Section - only show if theme is active */}
      {hasActiveTheme && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Controls */}
          <div className="space-y-6">
            {/* Presets */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  Quick Presets
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {presets.map((preset) => (
                    <Button
                      key={preset.key}
                      variant="outline"
                      size="sm"
                      onClick={() => handleApplyPreset(preset.key)}
                      disabled={isBusy}
                    >
                      {preset.name}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Dark Mode Toggle */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Base Mode</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <Label htmlFor="dark-mode">Dark Mode Base</Label>
                  <Switch
                    id="dark-mode"
                    checked={workingConfig.darkMode ?? false}
                    onCheckedChange={handleDarkModeToggle}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Use dark mode defaults as the base for your theme.
                </p>
              </CardContent>
            </Card>

            {/* Fonts */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Fonts</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Body Font</Label>
                  <Select
                    value={workingConfig.fonts?.body ?? ""}
                    onValueChange={(v) =>
                      handleFontChange("body", v as AllowedFont || undefined)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="System default" />
                    </SelectTrigger>
                    <SelectContent>
                      {FONT_OPTIONS.map((font) => (
                        <SelectItem key={font.value} value={font.value}>
                          {font.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Heading Font</Label>
                  <Select
                    value={workingConfig.fonts?.heading ?? ""}
                    onValueChange={(v) =>
                      handleFontChange("heading", v as AllowedFont || undefined)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="System default" />
                    </SelectTrigger>
                    <SelectContent>
                      {FONT_OPTIONS.map((font) => (
                        <SelectItem key={font.value} value={font.value}>
                          {font.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Colors */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Colors</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px] pr-4">
                  <div className="space-y-6">
                    {renderColorSection("Primary Colors", PRIMARY_COLORS)}
                    <Separator />
                    {renderColorSection("Background Colors", BACKGROUND_COLORS)}
                    <Separator />
                    {renderColorSection("UI Elements", UI_COLORS)}
                    <Separator />
                    {renderColorSection("Chart Colors", CHART_COLORS)}
                    <Separator />
                    {renderColorSection("Sidebar", SIDEBAR_COLORS)}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          {/* Right: Preview */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium">Preview</h3>
            <div className="sticky top-4">
              <ThemePreview config={workingConfig} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Skeleton
// ============================================================================

function ThemeStudioSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-80" />
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-24" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
