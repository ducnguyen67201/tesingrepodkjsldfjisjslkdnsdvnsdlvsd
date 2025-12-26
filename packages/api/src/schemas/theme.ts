/**
 * Workspace Theme Schemas
 *
 * Zod schemas for workspace visual customization via CSS variables.
 * Used with ExtensionInstall.configJson for THEME extensions.
 */

import { z } from "zod";

// ============================================================================
// CSS VARIABLE WHITELIST
// ============================================================================

/**
 * Allowed CSS variables (from globals.css Tailwind config).
 * Only these variables can be customized via themes.
 */
export const ALLOWED_CSS_VARS = [
  // Core colors
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "destructive-foreground",
  "border",
  "input",
  "ring",
  // Chart colors
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
  // Sidebar colors
  "sidebar-background",
  "sidebar-foreground",
  "sidebar-primary",
  "sidebar-primary-foreground",
  "sidebar-accent",
  "sidebar-accent-foreground",
  "sidebar-border",
  "sidebar-ring",
  // Radius
  "radius",
] as const;

export type AllowedCssVar = (typeof ALLOWED_CSS_VARS)[number];

/**
 * Zod schema for allowed CSS variable names.
 */
export const AllowedCssVarSchema = z.enum(ALLOWED_CSS_VARS);

// ============================================================================
// FONT WHITELIST
// ============================================================================

/**
 * Allowed fonts (safe system/bundled fonts).
 * Only these fonts can be used in themes.
 */
export const ALLOWED_FONTS = [
  // System fonts
  "system-ui",
  "ui-sans-serif",
  "ui-serif",
  "ui-monospace",
  "-apple-system",
  "BlinkMacSystemFont",
  "Segoe UI",
  "Roboto",
  "Helvetica Neue",
  "Arial",
  "Noto Sans",
  "sans-serif",
  "serif",
  "monospace",
  // Popular web-safe fonts
  "Georgia",
  "Times New Roman",
  "Courier New",
  "Verdana",
  "Tahoma",
  "Trebuchet MS",
  // Modern system fonts
  "Inter",
  "SF Pro",
  "SF Mono",
  "Menlo",
  "Monaco",
  "Consolas",
  "Liberation Mono",
  "Fira Code",
  "JetBrains Mono",
] as const;

export type AllowedFont = (typeof ALLOWED_FONTS)[number];

/**
 * Zod schema for allowed font names.
 */
export const AllowedFontSchema = z.enum(ALLOWED_FONTS);

// ============================================================================
// THEME CONFIG SCHEMA
// ============================================================================

/**
 * CSS variable value - HSL format like "47.9 95.8% 53.1%"
 * or other valid CSS value for non-color vars (e.g., "0.5rem" for radius).
 */
export const CssVarValueSchema = z.string().min(1).max(100);

/**
 * Font configuration for theme.
 */
export const ThemeFontsSchema = z.object({
  body: AllowedFontSchema.optional(),
  heading: AllowedFontSchema.optional(),
  mono: AllowedFontSchema.optional(),
});

export type ThemeFonts = z.infer<typeof ThemeFontsSchema>;

/**
 * CSS variables map - a partial record where keys must be from ALLOWED_CSS_VARS.
 * Using superRefine to validate keys because z.record(enum, value) in Zod 4
 * requires ALL enum keys to be present.
 */
export const ThemeCssVarsSchema = z
  .record(z.string(), CssVarValueSchema)
  .superRefine((data, ctx) => {
    for (const key of Object.keys(data)) {
      if (!ALLOWED_CSS_VARS.includes(key as AllowedCssVar)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Unknown CSS variable: " + key,
          path: [key],
        });
      }
    }
  });

export type ThemeCssVars = Partial<Record<AllowedCssVar, string>>;
/**
 * Workspace theme configuration stored in ExtensionInstall.configJson.
 */
export const WorkspaceThemeConfigSchema = z.object({
  /** Schema version for future migrations */
  version: z.string().default("1.0"),
  /** Font overrides */
  fonts: ThemeFontsSchema.optional(),
  /** CSS variable overrides (HSL values) */
  cssVars: ThemeCssVarsSchema.optional(),
  /** Whether to use dark mode base */
  darkMode: z.boolean().optional(),
});

export type WorkspaceThemeConfig = z.infer<typeof WorkspaceThemeConfigSchema>;

// ============================================================================
// DEFAULT THEME
// ============================================================================

/**
 * Default theme configuration (matches globals.css :root).
 */
export const DEFAULT_THEME: WorkspaceThemeConfig = {
  version: "1.0",
  fonts: undefined,
  cssVars: undefined,
  darkMode: false,
};

/**
 * Default CSS variable values from globals.css (light mode).
 */
export const DEFAULT_CSS_VARS: Record<AllowedCssVar, string> = {
  background: "0 0% 100%",
  foreground: "20 14.3% 4.1%",
  card: "0 0% 100%",
  "card-foreground": "20 14.3% 4.1%",
  popover: "0 0% 100%",
  "popover-foreground": "20 14.3% 4.1%",
  primary: "47.9 95.8% 53.1%",
  "primary-foreground": "26 83.3% 14.1%",
  secondary: "60 4.8% 95.9%",
  "secondary-foreground": "24 9.8% 10%",
  muted: "60 4.8% 95.9%",
  "muted-foreground": "25 5.3% 44.7%",
  accent: "60 4.8% 95.9%",
  "accent-foreground": "24 9.8% 10%",
  destructive: "0 84.2% 60.2%",
  "destructive-foreground": "60 9.1% 97.8%",
  border: "20 5.9% 90%",
  input: "20 5.9% 90%",
  ring: "20 14.3% 4.1%",
  "chart-1": "12 76% 61%",
  "chart-2": "173 58% 39%",
  "chart-3": "197 37% 24%",
  "chart-4": "43 74% 66%",
  "chart-5": "27 87% 67%",
  "sidebar-background": "0 0% 98%",
  "sidebar-foreground": "240 5.3% 26.1%",
  "sidebar-primary": "240 5.9% 10%",
  "sidebar-primary-foreground": "0 0% 98%",
  "sidebar-accent": "240 4.8% 95.9%",
  "sidebar-accent-foreground": "240 5.9% 10%",
  "sidebar-border": "220 13% 91%",
  "sidebar-ring": "217.2 91.2% 59.8%",
  radius: "0.5rem",
};

/**
 * Default CSS variable values for dark mode.
 */
export const DEFAULT_DARK_CSS_VARS: Record<AllowedCssVar, string> = {
  background: "20 14.3% 4.1%",
  foreground: "60 9.1% 97.8%",
  card: "20 14.3% 4.1%",
  "card-foreground": "60 9.1% 97.8%",
  popover: "20 14.3% 4.1%",
  "popover-foreground": "60 9.1% 97.8%",
  primary: "47.9 95.8% 53.1%",
  "primary-foreground": "26 83.3% 14.1%",
  secondary: "12 6.5% 15.1%",
  "secondary-foreground": "60 9.1% 97.8%",
  muted: "12 6.5% 15.1%",
  "muted-foreground": "24 5.4% 63.9%",
  accent: "12 6.5% 15.1%",
  "accent-foreground": "60 9.1% 97.8%",
  destructive: "0 62.8% 30.6%",
  "destructive-foreground": "60 9.1% 97.8%",
  border: "12 6.5% 15.1%",
  input: "12 6.5% 15.1%",
  ring: "35.5 91.7% 32.9%",
  "chart-1": "220 70% 50%",
  "chart-2": "160 60% 45%",
  "chart-3": "30 80% 55%",
  "chart-4": "280 65% 60%",
  "chart-5": "340 75% 55%",
  "sidebar-background": "240 5.9% 10%",
  "sidebar-foreground": "240 4.8% 95.9%",
  "sidebar-primary": "224.3 76.3% 48%",
  "sidebar-primary-foreground": "0 0% 100%",
  "sidebar-accent": "240 3.7% 15.9%",
  "sidebar-accent-foreground": "240 4.8% 95.9%",
  "sidebar-border": "240 3.7% 15.9%",
  "sidebar-ring": "217.2 91.2% 59.8%",
  radius: "0.5rem",
};

// ============================================================================
// API INPUT SCHEMAS
// ============================================================================

/**
 * Input for getting active theme.
 */
export const GetActiveThemeInput = z.object({
  workspaceId: z.string().min(1),
});

export type GetActiveThemeInputType = z.infer<typeof GetActiveThemeInput>;

/**
 * Input for setting active theme (enable one, disable others).
 */
export const SetActiveThemeInput = z.object({
  workspaceId: z.string().min(1),
  /** Install ID of theme to activate. Null to disable all themes. */
  installId: z.string().nullable(),
});

export type SetActiveThemeInputType = z.infer<typeof SetActiveThemeInput>;

/**
 * Input for saving theme configuration.
 */
export const SaveThemeConfigInput = z.object({
  workspaceId: z.string().min(1),
  installId: z.string().min(1),
  config: WorkspaceThemeConfigSchema,
});

export type SaveThemeConfigInputType = z.infer<typeof SaveThemeConfigInput>;

/**
 * Input for listing installed themes.
 */
export const ListInstalledThemesInput = z.object({
  workspaceId: z.string().min(1),
});

export type ListInstalledThemesInputType = z.infer<typeof ListInstalledThemesInput>;

// ============================================================================
// THEME PRESETS
// ============================================================================

/**
 * Preset theme configurations for quick selection.
 */
export const THEME_PRESETS = {
  /** Default yellow theme (matches globals.css) */
  default: {
    name: "Default",
    description: "The default Ducsigr yellow theme",
    config: DEFAULT_THEME,
  },
  /** Dark mode variant */
  dark: {
    name: "Dark",
    description: "Dark mode with yellow accents",
    config: {
      version: "1.0",
      darkMode: true,
    } as WorkspaceThemeConfig,
  },
  /** Blue professional theme */
  blue: {
    name: "Ocean",
    description: "Professional blue theme",
    config: {
      version: "1.0",
      cssVars: {
        primary: "221.2 83.2% 53.3%",
        "primary-foreground": "210 40% 98%",
        ring: "221.2 83.2% 53.3%",
      },
    } as WorkspaceThemeConfig,
  },
  /** Green theme */
  green: {
    name: "Forest",
    description: "Nature-inspired green theme",
    config: {
      version: "1.0",
      cssVars: {
        primary: "142.1 76.2% 36.3%",
        "primary-foreground": "355.7 100% 97.3%",
        ring: "142.1 76.2% 36.3%",
      },
    } as WorkspaceThemeConfig,
  },
  /** Purple theme */
  purple: {
    name: "Violet",
    description: "Elegant purple theme",
    config: {
      version: "1.0",
      cssVars: {
        primary: "262.1 83.3% 57.8%",
        "primary-foreground": "210 40% 98%",
        ring: "262.1 83.3% 57.8%",
      },
    } as WorkspaceThemeConfig,
  },
  /** Pink theme */
  pink: {
    name: "Pink Sakura",
    description: "Vibrant pink theme inspired by cherry blossoms",
    config: {
      version: "1.0",
      cssVars: {
        primary: "330 81% 60%",
        "primary-foreground": "0 0% 100%",
        ring: "330 81% 60%",
        accent: "330 70% 95%",
        "accent-foreground": "330 81% 30%",
        "sidebar-primary": "330 81% 60%",
        "sidebar-primary-foreground": "0 0% 100%",
        "sidebar-accent": "330 70% 95%",
        "sidebar-accent-foreground": "330 81% 30%",
      },
    } as WorkspaceThemeConfig,
  },
} as const;

export type ThemePresetKey = keyof typeof THEME_PRESETS;

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validates a CSS variable name is in the allowed list.
 */
export function isValidCssVar(name: string): name is AllowedCssVar {
  return ALLOWED_CSS_VARS.includes(name as AllowedCssVar);
}

/**
 * Validates a font name is in the allowed list.
 */
export function isValidFont(name: string): name is AllowedFont {
  return ALLOWED_FONTS.includes(name as AllowedFont);
}

/**
 * Validates a complete theme config.
 */
export function validateThemeConfig(
  config: unknown
): { success: true; data: WorkspaceThemeConfig } | { success: false; error: string } {
  const result = WorkspaceThemeConfigSchema.safeParse(config);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => issue.path.join(".") + ": " + issue.message)
      .join("; ");
    return { success: false, error: issues };
  }
  return { success: true, data: result.data };
}
