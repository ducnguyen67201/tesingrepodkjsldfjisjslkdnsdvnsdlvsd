import { describe, it, expect } from "vitest";
import {
  WorkspaceThemeConfigSchema,
  ALLOWED_CSS_VARS,
  ALLOWED_FONTS,
  AllowedCssVarSchema,
  AllowedFontSchema,
  ThemeFontsSchema,
  ThemeCssVarsSchema,
  isValidCssVar,
  isValidFont,
  validateThemeConfig,
  DEFAULT_THEME,
  DEFAULT_CSS_VARS,
  GetActiveThemeInput,
  SetActiveThemeInput,
  SaveThemeConfigInput,
  ListInstalledThemesInput,
  THEME_PRESETS,
} from "../theme";

// ============================================================
// ALLOWED_CSS_VARS
// ============================================================
describe("ALLOWED_CSS_VARS", () => {
  it("contains core color variables", () => {
    expect(ALLOWED_CSS_VARS).toContain("primary");
    expect(ALLOWED_CSS_VARS).toContain("background");
    expect(ALLOWED_CSS_VARS).toContain("foreground");
    expect(ALLOWED_CSS_VARS).toContain("destructive");
  });

  it("contains sidebar variables", () => {
    expect(ALLOWED_CSS_VARS).toContain("sidebar-background");
    expect(ALLOWED_CSS_VARS).toContain("sidebar-foreground");
    expect(ALLOWED_CSS_VARS).toContain("sidebar-primary");
  });

  it("contains chart variables", () => {
    expect(ALLOWED_CSS_VARS).toContain("chart-1");
    expect(ALLOWED_CSS_VARS).toContain("chart-5");
  });

  it("contains radius variable", () => {
    expect(ALLOWED_CSS_VARS).toContain("radius");
  });
});

// ============================================================
// ALLOWED_FONTS
// ============================================================
describe("ALLOWED_FONTS", () => {
  it("contains system fonts", () => {
    expect(ALLOWED_FONTS).toContain("system-ui");
    expect(ALLOWED_FONTS).toContain("sans-serif");
    expect(ALLOWED_FONTS).toContain("serif");
    expect(ALLOWED_FONTS).toContain("monospace");
  });

  it("contains popular web fonts", () => {
    expect(ALLOWED_FONTS).toContain("Inter");
    expect(ALLOWED_FONTS).toContain("Roboto");
    expect(ALLOWED_FONTS).toContain("Arial");
  });

  it("contains monospace fonts", () => {
    expect(ALLOWED_FONTS).toContain("Fira Code");
    expect(ALLOWED_FONTS).toContain("JetBrains Mono");
    expect(ALLOWED_FONTS).toContain("Consolas");
  });
});

// ============================================================
// AllowedCssVarSchema
// ============================================================
describe("AllowedCssVarSchema", () => {
  it("accepts valid CSS variable names", () => {
    expect(AllowedCssVarSchema.safeParse("primary").success).toBe(true);
    expect(AllowedCssVarSchema.safeParse("background").success).toBe(true);
    expect(AllowedCssVarSchema.safeParse("chart-1").success).toBe(true);
  });

  it("rejects unknown CSS variable names", () => {
    const result = AllowedCssVarSchema.safeParse("unknown-var");
    expect(result.success).toBe(false);
  });

  it("rejects arbitrary strings", () => {
    expect(AllowedCssVarSchema.safeParse("hacked-color").success).toBe(false);
    expect(AllowedCssVarSchema.safeParse("").success).toBe(false);
  });
});

// ============================================================
// AllowedFontSchema
// ============================================================
describe("AllowedFontSchema", () => {
  it("accepts valid font names", () => {
    expect(AllowedFontSchema.safeParse("Inter").success).toBe(true);
    expect(AllowedFontSchema.safeParse("system-ui").success).toBe(true);
  });

  it("rejects unknown font names", () => {
    const result = AllowedFontSchema.safeParse("Comic Sans MS");
    expect(result.success).toBe(false);
  });

  it("rejects arbitrary strings", () => {
    expect(AllowedFontSchema.safeParse("MyCustomFont").success).toBe(false);
    expect(AllowedFontSchema.safeParse("").success).toBe(false);
  });
});

// ============================================================
// ThemeFontsSchema
// ============================================================
describe("ThemeFontsSchema", () => {
  it("accepts valid font configuration", () => {
    const result = ThemeFontsSchema.safeParse({
      body: "Inter",
      heading: "system-ui",
      mono: "Fira Code",
    });
    expect(result.success).toBe(true);
  });

  it("accepts partial font configuration", () => {
    const result = ThemeFontsSchema.safeParse({
      body: "Inter",
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty configuration", () => {
    const result = ThemeFontsSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects disallowed fonts", () => {
    const result = ThemeFontsSchema.safeParse({
      body: "Comic Sans MS",
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================
// ThemeCssVarsSchema
// ============================================================
describe("ThemeCssVarsSchema", () => {
  it("accepts valid CSS variables", () => {
    const result = ThemeCssVarsSchema.safeParse({
      primary: "47.9 95.8% 53.1%",
      background: "0 0% 100%",
    });
    expect(result.success).toBe(true);
  });

  it("accepts single CSS variable", () => {
    const result = ThemeCssVarsSchema.safeParse({
      primary: "221.2 83.2% 53.3%",
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown CSS variables", () => {
    const result = ThemeCssVarsSchema.safeParse({
      "unknown-var": "0 0% 100%",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty values", () => {
    const result = ThemeCssVarsSchema.safeParse({
      primary: "",
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================
// WorkspaceThemeConfigSchema
// ============================================================
describe("WorkspaceThemeConfigSchema", () => {
  it("accepts valid complete configuration", () => {
    const result = WorkspaceThemeConfigSchema.safeParse({
      version: "1.0",
      fonts: {
        body: "Inter",
        heading: "system-ui",
      },
      cssVars: {
        primary: "221.2 83.2% 53.3%",
        background: "0 0% 100%",
      },
      darkMode: false,
    });
    expect(result.success).toBe(true);
    expect(result.data?.version).toBe("1.0");
  });

  it("accepts minimal configuration", () => {
    const result = WorkspaceThemeConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    expect(result.data?.version).toBe("1.0"); // default
  });

  it("accepts configuration with only cssVars", () => {
    const result = WorkspaceThemeConfigSchema.safeParse({
      cssVars: {
        primary: "142.1 76.2% 36.3%",
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts darkMode flag", () => {
    const result = WorkspaceThemeConfigSchema.safeParse({
      darkMode: true,
    });
    expect(result.success).toBe(true);
    expect(result.data?.darkMode).toBe(true);
  });

  it("rejects unknown CSS variables in cssVars", () => {
    const result = WorkspaceThemeConfigSchema.safeParse({
      cssVars: {
        "hacked-color": "red",
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects disallowed fonts", () => {
    const result = WorkspaceThemeConfigSchema.safeParse({
      fonts: {
        body: "EvilFont",
      },
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================
// Validation Helpers
// ============================================================
describe("isValidCssVar", () => {
  it("returns true for valid CSS variables", () => {
    expect(isValidCssVar("primary")).toBe(true);
    expect(isValidCssVar("background")).toBe(true);
    expect(isValidCssVar("sidebar-primary")).toBe(true);
  });

  it("returns false for invalid CSS variables", () => {
    expect(isValidCssVar("unknown")).toBe(false);
    expect(isValidCssVar("")).toBe(false);
    expect(isValidCssVar("hacked")).toBe(false);
  });
});

describe("isValidFont", () => {
  it("returns true for valid fonts", () => {
    expect(isValidFont("Inter")).toBe(true);
    expect(isValidFont("system-ui")).toBe(true);
  });

  it("returns false for invalid fonts", () => {
    expect(isValidFont("Comic Sans")).toBe(false);
    expect(isValidFont("")).toBe(false);
  });
});

describe("validateThemeConfig", () => {
  it("returns success for valid config", () => {
    const result = validateThemeConfig({
      version: "1.0",
      cssVars: { primary: "221.2 83.2% 53.3%" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.version).toBe("1.0");
    }
  });

  it("returns error for invalid config", () => {
    const result = validateThemeConfig({
      cssVars: { "invalid-var": "value" },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("invalid-var");
    }
  });
});

// ============================================================
// Default Values
// ============================================================
describe("DEFAULT_THEME", () => {
  it("has correct structure", () => {
    expect(DEFAULT_THEME.version).toBe("1.0");
    expect(DEFAULT_THEME.darkMode).toBe(false);
  });

  it("passes schema validation", () => {
    const result = WorkspaceThemeConfigSchema.safeParse(DEFAULT_THEME);
    expect(result.success).toBe(true);
  });
});

describe("DEFAULT_CSS_VARS", () => {
  it("has values for all allowed variables", () => {
    for (const varName of ALLOWED_CSS_VARS) {
      expect(DEFAULT_CSS_VARS[varName]).toBeDefined();
      expect(typeof DEFAULT_CSS_VARS[varName]).toBe("string");
    }
  });

  it("has valid primary color", () => {
    expect(DEFAULT_CSS_VARS.primary).toBe("47.9 95.8% 53.1%");
  });
});

// ============================================================
// Input Schemas
// ============================================================
describe("GetActiveThemeInput", () => {
  it("accepts valid workspaceId", () => {
    const result = GetActiveThemeInput.safeParse({ workspaceId: "ws_123" });
    expect(result.success).toBe(true);
  });

  it("rejects empty workspaceId", () => {
    const result = GetActiveThemeInput.safeParse({ workspaceId: "" });
    expect(result.success).toBe(false);
  });
});

describe("SetActiveThemeInput", () => {
  it("accepts installId to activate theme", () => {
    const result = SetActiveThemeInput.safeParse({
      workspaceId: "ws_123",
      installId: "inst_456",
    });
    expect(result.success).toBe(true);
  });

  it("accepts null installId to disable all themes", () => {
    const result = SetActiveThemeInput.safeParse({
      workspaceId: "ws_123",
      installId: null,
    });
    expect(result.success).toBe(true);
  });
});

describe("SaveThemeConfigInput", () => {
  it("accepts valid config", () => {
    const result = SaveThemeConfigInput.safeParse({
      workspaceId: "ws_123",
      installId: "inst_456",
      config: {
        version: "1.0",
        cssVars: { primary: "221.2 83.2% 53.3%" },
      },
    });
    expect(result.success).toBe(true);
  });
});

describe("ListInstalledThemesInput", () => {
  it("accepts valid workspaceId", () => {
    const result = ListInstalledThemesInput.safeParse({ workspaceId: "ws_123" });
    expect(result.success).toBe(true);
  });
});

// ============================================================
// THEME_PRESETS
// ============================================================
describe("THEME_PRESETS", () => {
  it("has default preset", () => {
    expect(THEME_PRESETS.default).toBeDefined();
    expect(THEME_PRESETS.default.name).toBe("Default");
  });

  it("has dark preset", () => {
    expect(THEME_PRESETS.dark).toBeDefined();
    expect(THEME_PRESETS.dark.config.darkMode).toBe(true);
  });

  it("all presets have valid configs", () => {
    for (const [key, preset] of Object.entries(THEME_PRESETS)) {
      const result = WorkspaceThemeConfigSchema.safeParse(preset.config);
      expect(result.success).toBe(true);
    }
  });

  it("has color variant presets", () => {
    expect(THEME_PRESETS.blue).toBeDefined();
    expect(THEME_PRESETS.green).toBeDefined();
    expect(THEME_PRESETS.purple).toBeDefined();
  });
});
