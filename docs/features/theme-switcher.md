# Theme Switcher Feature - Architecture Specification

## Overview

This document outlines the architecture and implementation plan for adding a theme switcher to the Ducsigr application sidebar.

```
┌─────────────────────────────────────────────────────────────────────┐
│                    THEME SWITCHER ARCHITECTURE                       │
└─────────────────────────────────────────────────────────────────────┘

                         ┌──────────────────────┐
                         │   ThemeProvider      │
                         │   (next-themes)      │
                         │   in layout.tsx      │
                         └──────────┬───────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
           ┌────────────┐  ┌────────────┐  ┌────────────────┐
           │ useTheme() │  │ useTheme() │  │  useTheme()    │
           │ hook       │  │ hook       │  │  hook          │
           └─────┬──────┘  └─────┬──────┘  └───────┬────────┘
                 │               │                 │
                 ▼               ▼                 ▼
           ┌────────────┐  ┌────────────┐  ┌────────────────┐
           │ThemeSwitcher│  │ NavUser    │  │ Other          │
           │ Component   │  │ Dropdown   │  │ Components     │
           └────────────┘  └────────────┘  └────────────────┘
                 │
                 ▼
    ┌─────────────────────────────────────────┐
    │           AppSidebar                    │
    │  ┌─────────────────────────────────┐    │
    │  │ SidebarHeader                   │    │
    │  │   └── WorkspaceSwitcher         │    │
    │  ├─────────────────────────────────┤    │
    │  │ SidebarContent                  │    │
    │  │   └── NavMain                   │    │
    │  ├─────────────────────────────────┤    │
    │  │ SidebarFooter                   │    │
    │  │   ├── ThemeSwitcher ◄── NEW     │    │
    │  │   └── NavUser                   │    │
    │  └─────────────────────────────────┘    │
    └─────────────────────────────────────────┘
```

## Current State Analysis

| Aspect | Status | Details |
|--------|--------|---------|
| `next-themes` | Installed | v0.4.6 in package.json |
| CSS Variables | Defined | Light & dark in `globals.css` |
| ThemeProvider | Missing | Not configured in layout.tsx |
| Theme Hook | Missing | No `useTheme` wrapper |
| Theme UI | Missing | No switcher component |

## Implementation Plan

### File Structure (New/Modified)

```
apps/web/src/
├── app/
│   └── layout.tsx                    # MODIFY - Add ThemeProvider
├── components/
│   ├── providers/
│   │   ├── index.ts                  # MODIFY - Export ThemeProvider
│   │   └── theme-provider.tsx        # NEW - ThemeProvider wrapper
│   └── layout/
│       ├── app-sidebar.tsx           # MODIFY - Add ThemeSwitcher
│       └── theme-switcher.tsx        # NEW - Theme toggle component
└── hooks/
    └── use-theme.ts                  # NEW - Theme hook (optional wrapper)
```

## Component Specifications

### 1. ThemeProvider (`components/providers/theme-provider.tsx`)

**Configuration Options:**

| Option | Value | Rationale |
|--------|-------|-----------|
| `attribute` | `"class"` | Uses `.dark` class (matches globals.css) |
| `defaultTheme` | `"system"` | Respects OS preference |
| `enableSystem` | `true` | Enables auto-detection |
| `disableTransitionOnChange` | `true` | Prevents flash on theme change |

### 2. ThemeSwitcher (`components/layout/theme-switcher.tsx`)

**Component Features:**
- Dropdown with 3 options: Light, Dark, System
- Shows current resolved theme icon
- Works with collapsed sidebar (tooltip)
- Follows existing sidebar patterns

**Theme Options:**

| Value | Label | Icon |
|-------|-------|------|
| `light` | Light | Sun |
| `dark` | Dark | Moon |
| `system` | System | Monitor |

### 3. Layout Updates

**Key Changes to `app/layout.tsx`:**
- Add `suppressHydrationWarning` to `<html>` (required by next-themes)
- Wrap with `ThemeProvider` as outermost provider

## Hydration Handling

To prevent hydration mismatch (common with theme switching), the component includes:
- `mounted` state check
- Placeholder skeleton during SSR
- `suppressHydrationWarning` on html element

## Implementation Checklist

| Step | File | Action |
|------|------|--------|
| 1 | `components/providers/theme-provider.tsx` | Create new file |
| 2 | `components/providers/index.ts` | Export ThemeProvider |
| 3 | `app/layout.tsx` | Add ThemeProvider + suppressHydrationWarning |
| 4 | `components/layout/theme-switcher.tsx` | Create new file |
| 5 | `components/layout/app-sidebar.tsx` | Import and add ThemeSwitcher |

## Testing Considerations

1. **Hydration**: Verify no console warnings about hydration mismatch
2. **Persistence**: Theme should persist across page refreshes (stored in localStorage)
3. **System preference**: Verify "System" option follows OS setting
4. **Collapsed sidebar**: Tooltip should appear when sidebar is collapsed
5. **SSR**: No flash of wrong theme on initial load

## Dependencies

- `next-themes`: ^0.4.6 (already installed)
- `lucide-react`: Sun, Moon, Monitor icons (already installed)

## Related Files

- `apps/web/src/app/globals.css` - CSS variables for light/dark themes
- `apps/web/src/components/ui/sidebar.tsx` - Sidebar UI components
- `apps/web/src/components/layout/app-sidebar.tsx` - Application sidebar
