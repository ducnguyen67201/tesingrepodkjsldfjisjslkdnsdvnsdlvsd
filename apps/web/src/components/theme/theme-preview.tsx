"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  type WorkspaceThemeConfig,
  DEFAULT_CSS_VARS,
  DEFAULT_DARK_CSS_VARS,
} from "@cognobserve/api/schemas";

// ============================================================================
// Types
// ============================================================================

interface ThemePreviewProps {
  config: WorkspaceThemeConfig;
}

// ============================================================================
// CSS Variable Builder
// ============================================================================

function buildPreviewVars(config: WorkspaceThemeConfig): Record<string, string> {
  const baseVars = config.darkMode ? DEFAULT_DARK_CSS_VARS : DEFAULT_CSS_VARS;
  const vars: Record<string, string> = {};

  for (const [key, value] of Object.entries(baseVars)) {
    vars["--" + key] = value;
  }

  if (config.cssVars) {
    for (const [key, value] of Object.entries(config.cssVars)) {
      vars["--" + key] = value;
    }
  }

  return vars;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Live preview of theme configuration.
 * Shows sample UI components with the applied theme.
 */
export function ThemePreview({ config }: ThemePreviewProps) {
  const cssVars = useMemo(() => buildPreviewVars(config), [config]);

  return (
    <div style={cssVars} className="rounded-lg border overflow-hidden">
      {/* Preview Header */}
      <div className="bg-muted px-4 py-2 border-b">
        <span className="text-sm font-medium text-muted-foreground">
          Live Preview
        </span>
      </div>

      {/* Preview Content */}
      <div className="bg-background p-6 space-y-6">
        {/* Buttons */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Buttons</Label>
          <div className="flex flex-wrap gap-2">
            <Button size="sm">Primary</Button>
            <Button size="sm" variant="secondary">
              Secondary
            </Button>
            <Button size="sm" variant="outline">
              Outline
            </Button>
            <Button size="sm" variant="destructive">
              Destructive
            </Button>
            <Button size="sm" variant="ghost">
              Ghost
            </Button>
          </div>
        </div>

        {/* Cards */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Cards</Label>
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Sample Card</CardTitle>
              </CardHeader>
              <CardContent className="py-2">
                <p className="text-xs text-muted-foreground">
                  Card content with muted text.
                </p>
              </CardContent>
            </Card>
            <Card className="border-destructive">
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Alert Card</CardTitle>
              </CardHeader>
              <CardContent className="py-2">
                <p className="text-xs text-destructive">
                  Destructive variant text.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Badges */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Badges</Label>
          <div className="flex flex-wrap gap-2">
            <Badge>Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="outline">Outline</Badge>
            <Badge variant="destructive">Destructive</Badge>
          </div>
        </div>

        {/* Form Elements */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Form Elements</Label>
          <div className="space-y-3">
            <Input
              placeholder="Input field..."
              className="max-w-xs"
            />
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Checkbox id="preview-check" />
                <Label htmlFor="preview-check" className="text-sm">
                  Checkbox
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch id="preview-switch" />
                <Label htmlFor="preview-switch" className="text-sm">
                  Switch
                </Label>
              </div>
            </div>
          </div>
        </div>

        {/* Text Samples */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Typography</Label>
          <div className="space-y-1">
            <p className="text-lg font-semibold text-foreground">
              Heading Text
            </p>
            <p className="text-sm text-foreground">
              Regular body text with foreground color.
            </p>
            <p className="text-sm text-muted-foreground">
              Muted text for secondary information.
            </p>
            <p className="text-sm text-primary">
              Primary colored text for emphasis.
            </p>
            <p className="text-sm text-destructive">
              Destructive text for warnings.
            </p>
          </div>
        </div>

        {/* Color Swatches */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Color Palette</Label>
          <div className="grid grid-cols-6 gap-2">
            <div className="space-y-1">
              <div className="h-8 rounded bg-primary" />
              <span className="text-[10px] text-muted-foreground">Primary</span>
            </div>
            <div className="space-y-1">
              <div className="h-8 rounded bg-secondary" />
              <span className="text-[10px] text-muted-foreground">Secondary</span>
            </div>
            <div className="space-y-1">
              <div className="h-8 rounded bg-accent" />
              <span className="text-[10px] text-muted-foreground">Accent</span>
            </div>
            <div className="space-y-1">
              <div className="h-8 rounded bg-muted" />
              <span className="text-[10px] text-muted-foreground">Muted</span>
            </div>
            <div className="space-y-1">
              <div className="h-8 rounded bg-destructive" />
              <span className="text-[10px] text-muted-foreground">Destructive</span>
            </div>
            <div className="space-y-1">
              <div className="h-8 rounded border bg-background" />
              <span className="text-[10px] text-muted-foreground">Background</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
