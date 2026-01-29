/**
 * Central color definitions for the marketing site.
 * Use these constants throughout the app for consistency.
 */

export const COLORS = {
  // Background colors
  bg: {
    primary: "#F8FAFC", // Main background
    secondary: "#EFF2F6", // Section backgrounds
    white: "#FFFFFF",
  },

  // Text colors
  ink: {
    primary: "#0F172A", // Headings
    secondary: "#475569", // Body text
    muted: "#64748B", // Subtle text
  },

  // Accent colors (Yellow theme)
  accent: {
    yellow: "#F6C453", // Primary accent
    yellowStrong: "#D97706", // Darker yellow for emphasis
    yellowLight: "#FCD34D", // Hover state
    yellowDim: "rgba(246, 196, 83, 0.15)", // Subtle backgrounds
  },

  // Feature card colors
  feature: {
    sky: {
      bg: "#F0F9FF", // bg-sky-50
      border: "#E0F2FE", // border-sky-100
      icon: "#0EA5E9", // text-sky-500
      hover: "rgba(224, 242, 254, 0.5)", // hover shadow
    },
    yellow: {
      bg: "#FFFBEB", // bg-amber-50
      border: "#FEF3C7", // border-amber-100
      icon: "#D97706", // text-amber-600
      hover: "rgba(254, 243, 199, 0.5)",
    },
    green: {
      bg: "#ECFDF5", // bg-emerald-50
      border: "#D1FAE5", // border-emerald-100
      icon: "#059669", // text-emerald-600
      hover: "rgba(209, 250, 229, 0.5)",
    },
    slate: {
      bg: "#F8FAFC", // bg-slate-50
      border: "#F1F5F9", // border-slate-100
      icon: "#475569", // text-slate-600
      hover: "rgba(241, 245, 249, 0.5)",
    },
  },

  // Glow effects
  glow: {
    ice: "rgba(56, 189, 248, 0.15)",
    yellow: "rgba(246, 196, 83, 0.35)",
    indigo: "rgba(99, 102, 241, 0.15)",
  },

  // Status colors
  status: {
    healthy: "#10B981", // green
    info: "#38BDF8", // sky
    warning: "#F59E0B", // amber
    error: "#EF4444", // red
    muted: "#94A3B8", // slate
  },

  // Border colors
  border: {
    light: "rgba(148, 163, 184, 0.15)",
    glass: "rgba(255, 255, 255, 0.8)",
  },

  // Integration brand colors
  integrations: {
    postgres: "#336791",
    redis: "#D82C20",
    kubernetes: "#326CE5",
    go: "#00ADD8",
    nodejs: "#339933",
    aws: "#FF9900",
  },
} as const;

// CSS variable mappings for use in globals.css
export const CSS_VARS = {
  "--bg-0": COLORS.bg.primary,
  "--bg-1": COLORS.bg.secondary,
  "--ink-0": COLORS.ink.primary,
  "--ink-1": COLORS.ink.secondary,
  "--ink-2": COLORS.ink.muted,
  "--accent-yellow": COLORS.accent.yellow,
  "--accent-yellow-strong": COLORS.accent.yellowStrong,
  "--glow-ice": COLORS.glow.ice,
  "--glow-yellow": COLORS.glow.yellow,
  "--line-0": COLORS.border.light,
  "--glass-border": COLORS.border.glass,
} as const;

// Tailwind class helpers for consistent styling
export const colorClasses = {
  text: {
    primary: "text-[#0F172A]",
    secondary: "text-[#475569]",
    muted: "text-[#64748B]",
    accent: "text-[#D97706]",
  },
  bg: {
    primary: "bg-[#F8FAFC]",
    secondary: "bg-[#EFF2F6]",
    accent: "bg-[#F6C453]",
    accentHover: "hover:bg-[#FCD34D]",
  },
} as const;
