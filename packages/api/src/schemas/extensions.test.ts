import { describe, it, expect } from "vitest";
import {
  ExtensionTypeSchema,
  ExtensionVisibilitySchema,
  ExtensionPermissionSchema,
  ExtensionManifestSchema,
  ThemeConfigSchema,
  IngestionConfigSchema,
  ListExtensionsInput,
  InstallExtensionInput,
  ToggleExtensionInput,
  ConfigureExtensionInput,
  UninstallExtensionInput,
  ImportManifestInput,
  EXTENSION_TYPES,
  EXTENSION_PERMISSIONS,
  PERMISSION_LABELS,
  PERMISSION_RISK,
} from "./extensions";

// ============================================================
// TEST FIXTURES
// ============================================================

const validManifest = {
  id: "com.example.my-extension",
  name: "My Extension",
  version: "1.0.0",
  type: "THEME" as const,
  permissions: ["ui:theme" as const],
};

const validThemeConfig = {
  version: "1.0",
  fonts: {
    body: "Inter",
    heading: "Space Grotesk",
  },
  cssVars: {
    "--background": "0 0% 100%",
    "--foreground": "20 14.3% 4.1%",
  },
};

const validIngestionConfig = {
  hooks: ["after_normalize" as const, "after_scrub" as const],
  priority: 50,
};

// ============================================================
// ExtensionTypeSchema TESTS
// ============================================================

describe("ExtensionTypeSchema", () => {
  it("accepts valid extension types", () => {
    const types = ["THEME", "INGESTION", "POLICY", "WEBHOOK"];
    for (const type of types) {
      const result = ExtensionTypeSchema.safeParse(type);
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid extension type", () => {
    const result = ExtensionTypeSchema.safeParse("INVALID_TYPE");
    expect(result.success).toBe(false);
  });

  it("exports EXTENSION_TYPES constant", () => {
    expect(EXTENSION_TYPES).toEqual(["THEME", "INGESTION", "POLICY", "WEBHOOK"]);
  });
});

// ============================================================
// ExtensionVisibilitySchema TESTS
// ============================================================

describe("ExtensionVisibilitySchema", () => {
  it("accepts valid visibility options", () => {
    const options = ["PUBLIC", "PRIVATE", "UNLISTED"];
    for (const visibility of options) {
      const result = ExtensionVisibilitySchema.safeParse(visibility);
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid visibility", () => {
    const result = ExtensionVisibilitySchema.safeParse("HIDDEN");
    expect(result.success).toBe(false);
  });
});

// ============================================================
// ExtensionPermissionSchema TESTS
// ============================================================

describe("ExtensionPermissionSchema", () => {
  it("accepts valid permissions", () => {
    const permissions = [
      "ingest:read-span",
      "ingest:write-span",
      "ui:theme",
      "network:none",
      "network:restricted",
      "policy:read",
      "policy:write",
    ];
    for (const permission of permissions) {
      const result = ExtensionPermissionSchema.safeParse(permission);
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid permission", () => {
    const result = ExtensionPermissionSchema.safeParse("invalid:permission");
    expect(result.success).toBe(false);
  });

  it("has labels for all permissions", () => {
    for (const permission of EXTENSION_PERMISSIONS) {
      expect(PERMISSION_LABELS[permission]).toBeDefined();
      expect(typeof PERMISSION_LABELS[permission]).toBe("string");
    }
  });

  it("has risk levels for all permissions", () => {
    for (const permission of EXTENSION_PERMISSIONS) {
      expect(PERMISSION_RISK[permission]).toBeDefined();
      expect(["low", "medium", "high"]).toContain(PERMISSION_RISK[permission]);
    }
  });
});

// ============================================================
// ExtensionManifestSchema TESTS
// ============================================================

describe("ExtensionManifestSchema", () => {
  it("accepts valid manifest", () => {
    const result = ExtensionManifestSchema.safeParse(validManifest);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe("com.example.my-extension");
      expect(result.data.name).toBe("My Extension");
      expect(result.data.version).toBe("1.0.0");
      expect(result.data.type).toBe("THEME");
    }
  });

  it("validates id format (lowercase, dots, hyphens)", () => {
    // Must have at least 2 segments with dot (e.g., vendor.extension-name)
    const validIds = [
      "com.extension",
      "com.example.extension",
      "org.company.feature-name",
    ];
    for (const id of validIds) {
      const result = ExtensionManifestSchema.safeParse({ ...validManifest, id });
      expect(result.success).toBe(true);
    }

    const invalidIds = [
      "my-extension", // missing vendor segment (no dot)
      "MyExtension", // uppercase
      "my_extension", // underscore
      "my extension", // space
      "", // empty
    ];
    for (const id of invalidIds) {
      const result = ExtensionManifestSchema.safeParse({ ...validManifest, id });
      expect(result.success).toBe(false);
    }
  });

  it("validates version format (semver)", () => {
    const validVersions = ["1.0.0", "0.1.0", "10.20.30"];
    for (const version of validVersions) {
      const result = ExtensionManifestSchema.safeParse({
        ...validManifest,
        version,
      });
      expect(result.success).toBe(true);
    }

    const invalidVersions = ["1.0", "v1.0.0", "1.0.0-beta", ""];
    for (const version of invalidVersions) {
      const result = ExtensionManifestSchema.safeParse({
        ...validManifest,
        version,
      });
      expect(result.success).toBe(false);
    }
  });

  it("requires name", () => {
    const result = ExtensionManifestSchema.safeParse({
      ...validManifest,
      name: "",
    });
    expect(result.success).toBe(false);
  });

  it("enforces name max length", () => {
    const result = ExtensionManifestSchema.safeParse({
      ...validManifest,
      name: "a".repeat(101),
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional fields", () => {
    const fullManifest = {
      ...validManifest,
      description: "A test extension",
      entry: "dist/index.js",
      hooks: ["after_normalize"],
      configSchema: { type: "object" },
      author: "Test Author",
      homepage: "https://example.com",
      icon: "data:image/png;base64,abc",
    };
    const result = ExtensionManifestSchema.safeParse(fullManifest);
    expect(result.success).toBe(true);
  });

  it("validates homepage is a URL", () => {
    const result = ExtensionManifestSchema.safeParse({
      ...validManifest,
      homepage: "not-a-url",
    });
    expect(result.success).toBe(false);
  });

  it("validates permissions array", () => {
    const result = ExtensionManifestSchema.safeParse({
      ...validManifest,
      permissions: ["invalid:perm"],
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================
// ThemeConfigSchema TESTS
// ============================================================

describe("ThemeConfigSchema", () => {
  it("accepts valid theme config", () => {
    const result = ThemeConfigSchema.safeParse(validThemeConfig);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.version).toBe("1.0");
      expect(result.data.fonts?.body).toBe("Inter");
    }
  });

  it("accepts minimal config", () => {
    const result = ThemeConfigSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("applies default version", () => {
    const result = ThemeConfigSchema.safeParse({
      fonts: { body: "Inter" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.version).toBe("1.0");
    }
  });
});

// ============================================================
// IngestionConfigSchema TESTS
// ============================================================

describe("IngestionConfigSchema", () => {
  it("accepts valid ingestion config", () => {
    const result = IngestionConfigSchema.safeParse(validIngestionConfig);
    expect(result.success).toBe(true);
  });

  it("validates hooks enum values", () => {
    const validHooks = [
      "after_parse",
      "after_normalize",
      "after_validate",
      "after_scrub",
    ];
    const result = IngestionConfigSchema.safeParse({
      hooks: validHooks,
      priority: 50,
    });
    expect(result.success).toBe(true);

    const invalidResult = IngestionConfigSchema.safeParse({
      hooks: ["before_parse"], // invalid hook
      priority: 50,
    });
    expect(invalidResult.success).toBe(false);
  });

  it("validates priority range 0-100", () => {
    const tooLow = IngestionConfigSchema.safeParse({
      hooks: ["after_normalize"],
      priority: -1,
    });
    expect(tooLow.success).toBe(false);

    const tooHigh = IngestionConfigSchema.safeParse({
      hooks: ["after_normalize"],
      priority: 101,
    });
    expect(tooHigh.success).toBe(false);

    const valid = IngestionConfigSchema.safeParse({
      hooks: ["after_normalize"],
      priority: 50,
    });
    expect(valid.success).toBe(true);
  });

  it("applies default priority", () => {
    const result = IngestionConfigSchema.safeParse({
      hooks: ["after_normalize"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.priority).toBe(50);
    }
  });
});

// ============================================================
// API INPUT SCHEMAS TESTS
// ============================================================

describe("ListExtensionsInput", () => {
  it("accepts empty input (all optional)", () => {
    const result = ListExtensionsInput.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts all filter options", () => {
    const result = ListExtensionsInput.safeParse({
      workspaceSlug: "my-workspace",
      type: "THEME",
      search: "dark mode",
      visibility: "PUBLIC",
      installedOnly: true,
    });
    expect(result.success).toBe(true);
  });

  it("validates type enum", () => {
    const result = ListExtensionsInput.safeParse({ type: "INVALID" });
    expect(result.success).toBe(false);
  });
});

describe("InstallExtensionInput", () => {
  it("requires workspaceId and extensionId", () => {
    const result = InstallExtensionInput.safeParse({});
    expect(result.success).toBe(false);
  });

  it("requires approvedPermissions", () => {
    const result = InstallExtensionInput.safeParse({
      workspaceId: "ws_123",
      extensionId: "ext_456",
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid install input", () => {
    const result = InstallExtensionInput.safeParse({
      workspaceId: "ws_123",
      extensionId: "ext_456",
      approvedPermissions: ["ui:theme"],
    });
    expect(result.success).toBe(true);
  });

  it("accepts optional versionId and config", () => {
    const result = InstallExtensionInput.safeParse({
      workspaceId: "ws_123",
      extensionId: "ext_456",
      versionId: "ver_789",
      approvedPermissions: ["ui:theme"],
      config: { theme: "dark" },
    });
    expect(result.success).toBe(true);
  });

  it("validates permissions array", () => {
    const result = InstallExtensionInput.safeParse({
      workspaceId: "ws_123",
      extensionId: "ext_456",
      approvedPermissions: ["invalid:perm"],
    });
    expect(result.success).toBe(false);
  });
});

describe("ToggleExtensionInput", () => {
  it("requires all fields", () => {
    const result = ToggleExtensionInput.safeParse({});
    expect(result.success).toBe(false);
  });

  it("accepts valid toggle input", () => {
    const result = ToggleExtensionInput.safeParse({
      workspaceId: "ws_123",
      installId: "inst_456",
      enabled: true,
    });
    expect(result.success).toBe(true);
  });

  it("accepts enabled: false", () => {
    const result = ToggleExtensionInput.safeParse({
      workspaceId: "ws_123",
      installId: "inst_456",
      enabled: false,
    });
    expect(result.success).toBe(true);
  });
});

describe("ConfigureExtensionInput", () => {
  it("requires config object", () => {
    const result = ConfigureExtensionInput.safeParse({
      workspaceId: "ws_123",
      installId: "inst_456",
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid config input", () => {
    const result = ConfigureExtensionInput.safeParse({
      workspaceId: "ws_123",
      installId: "inst_456",
      config: { theme: "dark", fontSize: 14 },
    });
    expect(result.success).toBe(true);
  });
});

describe("UninstallExtensionInput", () => {
  it("requires workspaceId and installId", () => {
    const result = UninstallExtensionInput.safeParse({});
    expect(result.success).toBe(false);

    const partial = UninstallExtensionInput.safeParse({
      workspaceId: "ws_123",
    });
    expect(partial.success).toBe(false);
  });

  it("accepts valid uninstall input", () => {
    const result = UninstallExtensionInput.safeParse({
      workspaceId: "ws_123",
      installId: "inst_456",
    });
    expect(result.success).toBe(true);
  });
});

describe("ImportManifestInput", () => {
  it("requires workspaceId and manifest", () => {
    const result = ImportManifestInput.safeParse({});
    expect(result.success).toBe(false);
  });

  it("accepts valid import input", () => {
    const result = ImportManifestInput.safeParse({
      workspaceId: "ws_123",
      manifest: validManifest,
    });
    expect(result.success).toBe(true);
  });

  it("applies default visibility", () => {
    const result = ImportManifestInput.safeParse({
      workspaceId: "ws_123",
      manifest: validManifest,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.visibility).toBe("PRIVATE");
    }
  });

  it("validates nested manifest", () => {
    const result = ImportManifestInput.safeParse({
      workspaceId: "ws_123",
      manifest: {
        ...validManifest,
        version: "invalid",
      },
    });
    expect(result.success).toBe(false);
  });
});
