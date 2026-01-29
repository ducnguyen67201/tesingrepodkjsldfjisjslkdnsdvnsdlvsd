"use client";

import { createContext, useContext, useMemo, useEffect, type ReactNode } from "react";
import {
  type WorkspaceThemeConfig,
  ALLOWED_CSS_VARS,
  DEFAULT_CSS_VARS,
  DEFAULT_DARK_CSS_VARS,
} from "@ducsigr/api/schemas";
import { trpc } from "@/lib/trpc/client";

// ============================================================================
// Context
// ============================================================================

interface ThemeContextValue {
  config: WorkspaceThemeConfig | null;
  isActive: boolean;
}

const ThemeContext = createContext<ThemeContextValue>({
  config: null,
  isActive: false,
});

export const useThemeContext = () => useContext(ThemeContext);

// ============================================================================
// CSS Variable Application
// ============================================================================

/**
 * Build CSS style object from theme config.
 * Merges default values with user overrides.
 */
function buildCssVars(config: WorkspaceThemeConfig | null): Record<string, string> {
  if (!config) {
    return {};
  }

  const baseVars = config.darkMode ? DEFAULT_DARK_CSS_VARS : DEFAULT_CSS_VARS;
  const vars: Record<string, string> = {};

  // Apply base CSS variables
  for (const [key, value] of Object.entries(baseVars)) {
    vars["--" + key] = value;
  }

  // Apply user overrides
  if (config.cssVars) {
    for (const [key, value] of Object.entries(config.cssVars)) {
      vars["--" + key] = value;
    }
  }

  // Apply font family if specified
  if (config.fonts?.body) {
    vars["--font-body"] = config.fonts.body;
  }
  if (config.fonts?.heading) {
    vars["--font-heading"] = config.fonts.heading;
  }
  if (config.fonts?.mono) {
    vars["--font-mono"] = config.fonts.mono;
  }

  return vars;
}

// ============================================================================
// ThemeWrapper Component
// ============================================================================

interface ThemeWrapperProps {
  children: ReactNode;
  /** Workspace ID for client-side theme fetching */
  workspaceId: string;
  /** Initial theme config from server-side render (SSR) */
  initialConfig: WorkspaceThemeConfig | null;
  /** Initial active state from server-side render (SSR) */
  initialIsActive?: boolean;
}

/**
 * Wrapper component that applies theme CSS variables to its children.
 * Used at the workspace layout level to apply workspace-specific themes.
 *
 * Uses SSR data for initial render, then switches to client-side tRPC query
 * to enable live updates when theme changes without full page refresh.
 */
export function ThemeWrapper({
  children,
  workspaceId,
  initialConfig,
  initialIsActive = false,
}: ThemeWrapperProps) {
  // Client-side query with SSR data as initial
  // This allows live updates when theme.getActive is invalidated
  const { data: activeTheme } = trpc.theme.getActive.useQuery(
    { workspaceId },
    {
      enabled: !!workspaceId,
      // Refetch on window focus to catch external changes
      refetchOnWindowFocus: true,
      staleTime: 10_000,
    }
  );

  // Use client-side data if available, fall back to initial
  const config = activeTheme?.config ?? initialConfig;
  const isActive = activeTheme?.isActive ?? initialIsActive;

  const cssVars = useMemo(() => buildCssVars(config), [config]);

  const contextValue = useMemo(
    () => ({
      config,
      isActive,
    }),
    [config, isActive]
  );

  // Only apply CSS variables if there's an active theme
  const hasCustomTheme = isActive && config && Object.keys(cssVars).length > 0;

  // Apply CSS variables to document root so portaled elements (tooltips, modals) inherit them
  useEffect(() => {
    // Helper to remove all possible theme CSS variables
    const removeAllThemeVars = () => {
      for (const varName of ALLOWED_CSS_VARS) {
        document.documentElement.style.removeProperty(`--${varName}`);
      }
      // Also remove font variables
      document.documentElement.style.removeProperty("--font-body");
      document.documentElement.style.removeProperty("--font-heading");
      document.documentElement.style.removeProperty("--font-mono");
    };

    if (!hasCustomTheme) {
      // Remove all possible custom properties when theme is disabled
      removeAllThemeVars();
      return;
    }

    // Apply custom properties to :root
    for (const [key, value] of Object.entries(cssVars)) {
      document.documentElement.style.setProperty(key, value);
    }

    // Cleanup on unmount or when theme changes
    return () => {
      removeAllThemeVars();
    };
  }, [cssVars, hasCustomTheme]);

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
}

// ============================================================================
// Theme Preview Wrapper
// ============================================================================

interface ThemePreviewWrapperProps {
  children: ReactNode;
  config: WorkspaceThemeConfig;
}

/**
 * Preview wrapper for theme studio.
 * Always applies CSS variables for live preview.
 */
export function ThemePreviewWrapper({
  children,
  config,
}: ThemePreviewWrapperProps) {
  const cssVars = useMemo(() => buildCssVars(config), [config]);

  return (
    <div style={cssVars} className="rounded-lg border p-4">
      {children}
    </div>
  );
}

// ============================================================================
// CSS Variable Helpers
// ============================================================================

/**
 * Parse HSL string to individual values.
 * Input: "47.9 95.8% 53.1%"
 * Output: { h: 47.9, s: 95.8, l: 53.1 }
 */
export function parseHsl(hslString: string): { h: number; s: number; l: number } | null {
  const match = hslString.match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/);
  if (!match) {
    return null;
  }
  return {
    h: parseFloat(match[1] ?? "0"),
    s: parseFloat(match[2] ?? "0"),
    l: parseFloat(match[3] ?? "0"),
  };
}

/**
 * Format HSL values to string.
 * Input: { h: 47.9, s: 95.8, l: 53.1 }
 * Output: "47.9 95.8% 53.1%"
 */
export function formatHsl(h: number, s: number, l: number): string {
  return h.toFixed(1) + " " + s.toFixed(1) + "% " + l.toFixed(1) + "%";
}

/**
 * Convert HSL to hex color.
 */
export function hslToHex(h: number, s: number, l: number): string {
  s = s / 100;
  l = l / 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let r = 0,
    g = 0,
    b = 0;

  if (h >= 0 && h < 60) {
    r = c;
    g = x;
    b = 0;
  } else if (h >= 60 && h < 120) {
    r = x;
    g = c;
    b = 0;
  } else if (h >= 120 && h < 180) {
    r = 0;
    g = c;
    b = x;
  } else if (h >= 180 && h < 240) {
    r = 0;
    g = x;
    b = c;
  } else if (h >= 240 && h < 300) {
    r = x;
    g = 0;
    b = c;
  } else if (h >= 300 && h < 360) {
    r = c;
    g = 0;
    b = x;
  }

  const toHex = (n: number) => {
    const hex = Math.round((n + m) * 255).toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  };

  return "#" + toHex(r) + toHex(g) + toHex(b);
}

/**
 * Convert hex to HSL values.
 */
export function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  // Remove # if present
  hex = hex.replace(/^#/, "");

  // Parse hex values
  if (hex.length !== 6) {
    return null;
  }

  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) {
    return { h: 0, s: 0, l: l * 100 };
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h = 0;
  if (max === r) {
    h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  } else if (max === g) {
    h = ((b - r) / d + 2) / 6;
  } else {
    h = ((r - g) / d + 4) / 6;
  }

  return {
    h: h * 360,
    s: s * 100,
    l: l * 100,
  };
}
