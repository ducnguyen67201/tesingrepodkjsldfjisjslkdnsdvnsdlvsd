import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { createCallerFactory } from "../../trpc";
import type { SessionWithWorkspaces } from "../../context";

// Mock prisma
vi.mock("@cognobserve/db", () => ({
  prisma: {
    extensionInstall: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    extensionAuditLog: {
      create: vi.fn(),
    },
    $transaction: vi.fn((callback) => {
      if (typeof callback === "function") {
        return callback({
          extensionInstall: {
            findFirst: vi.fn(),
            update: vi.fn(),
            updateMany: vi.fn(),
          },
          extensionAuditLog: {
            create: vi.fn(),
          },
        });
      }
      return Promise.resolve(callback);
    }),
  },
  Prisma: {
    InputJsonValue: {},
  },
}));

// Import after mocks
import { prisma } from "@cognobserve/db";
import { themeRouter } from "../theme";
import { DEFAULT_THEME } from "../../schemas/theme";

// ============================================================
// TEST FIXTURES
// ============================================================

const mockUser = {
  id: "user_123",
  name: "Test User",
  email: "test@example.com",
  image: null,
};

const mockWorkspace = {
  id: "ws_123",
  slug: "test-workspace",
  role: "ADMIN",
  isPersonal: false,
};

const mockMemberWorkspace = {
  id: "ws_123",
  slug: "test-workspace",
  role: "MEMBER",
  isPersonal: false,
};

const mockSession: SessionWithWorkspaces = {
  user: {
    ...mockUser,
    workspaces: [mockWorkspace],
    projects: [],
  },
  expires: new Date(Date.now() + 86400000).toISOString(),
};

const mockMemberSession: SessionWithWorkspaces = {
  user: {
    ...mockUser,
    workspaces: [mockMemberWorkspace],
    projects: [],
  },
  expires: new Date(Date.now() + 86400000).toISOString(),
};

const mockThemeExtension = {
  id: "ext_theme_123",
  slug: "com.cognobserve.custom-theme",
  name: "Custom Theme",
  description: "A custom theme",
  type: "THEME" as const,
};

const mockThemeInstall = {
  id: "inst_theme_123",
  workspaceId: "ws_123",
  extensionId: "ext_theme_123",
  extensionVersionId: "ver_123",
  enabled: true,
  configJson: {
    version: "1.0",
    cssVars: {
      primary: "221.2 83.2% 53.3%",
    },
  },
  approvedPermissions: ["ui:theme"],
  installedById: "user_123",
  createdAt: new Date(),
  updatedAt: new Date(),
  extension: mockThemeExtension,
};

const mockDisabledThemeInstall = {
  ...mockThemeInstall,
  id: "inst_theme_456",
  enabled: false,
  configJson: {
    version: "1.0",
    cssVars: {
      primary: "142.1 76.2% 36.3%",
    },
  },
};

// ============================================================
// TEST HELPERS
// ============================================================

const createCaller = createCallerFactory(themeRouter);

const createTestCaller = (session: SessionWithWorkspaces | null = mockSession) => {
  return createCaller({ session });
};

// ============================================================
// TESTS
// ============================================================

describe("themeRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================
  // getActive
  // ============================================================
  describe("getActive", () => {
    it("returns default theme when no theme extension installed", async () => {
      const caller = createTestCaller();
      vi.mocked(prisma.extensionInstall.findFirst).mockResolvedValue(null);

      const result = await caller.getActive({ workspaceId: "ws_123" });

      expect(result.config).toEqual(DEFAULT_THEME);
      expect(result.installId).toBeNull();
      expect(result.extensionName).toBeNull();
    });

    it("returns active theme config when extension enabled", async () => {
      const caller = createTestCaller();
      vi.mocked(prisma.extensionInstall.findFirst).mockResolvedValue(
        mockThemeInstall as unknown as Awaited<
          ReturnType<typeof prisma.extensionInstall.findFirst>
        >
      );

      const result = await caller.getActive({ workspaceId: "ws_123" });

      expect(result.config.cssVars?.primary).toBe("221.2 83.2% 53.3%");
      expect(result.installId).toBe("inst_theme_123");
      expect(result.extensionName).toBe("Custom Theme");
    });

    it("returns default when all themes disabled", async () => {
      const caller = createTestCaller();
      vi.mocked(prisma.extensionInstall.findFirst).mockResolvedValue(null);

      const result = await caller.getActive({ workspaceId: "ws_123" });

      expect(result.config).toEqual(DEFAULT_THEME);
      expect(result.installId).toBeNull();
    });

    it("requires authentication", async () => {
      const caller = createTestCaller(null);

      await expect(caller.getActive({ workspaceId: "ws_123" })).rejects.toThrow(
        TRPCError
      );
    });

    it("requires workspace access", async () => {
      const noAccessSession: SessionWithWorkspaces = {
        ...mockSession,
        user: {
          ...mockSession.user,
          workspaces: [],
        },
      };
      const caller = createTestCaller(noAccessSession);

      await expect(caller.getActive({ workspaceId: "ws_123" })).rejects.toThrow(
        TRPCError
      );
    });
  });

  // ============================================================
  // setActive
  // ============================================================
  describe("setActive", () => {
    it("enables specified theme and disables others", async () => {
      const caller = createTestCaller();

      vi.mocked(prisma.extensionInstall.findFirst).mockResolvedValue(
        mockDisabledThemeInstall as unknown as Awaited<
          ReturnType<typeof prisma.extensionInstall.findFirst>
        >
      );

      const mockTx = {
        extensionInstall: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          update: vi.fn().mockResolvedValue({ ...mockDisabledThemeInstall, enabled: true }),
        },
        extensionAuditLog: {
          create: vi.fn().mockResolvedValue({}),
        },
      };

      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        if (typeof callback === "function") {
          return callback(mockTx as unknown as Parameters<typeof callback>[0]);
        }
        return Promise.resolve(callback);
      });

      const result = await caller.setActive({
        workspaceId: "ws_123",
        installId: "inst_theme_456",
      });

      expect(result.success).toBe(true);
      expect(mockTx.extensionInstall.updateMany).toHaveBeenCalled();
      expect(mockTx.extensionInstall.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "inst_theme_456" },
          data: { enabled: true },
        })
      );
    });

    it("disables all themes when installId is null", async () => {
      const caller = createTestCaller();

      const mockTx = {
        extensionInstall: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          update: vi.fn(),
        },
        extensionAuditLog: {
          create: vi.fn().mockResolvedValue({}),
        },
      };

      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        if (typeof callback === "function") {
          return callback(mockTx as unknown as Parameters<typeof callback>[0]);
        }
        return Promise.resolve(callback);
      });

      const result = await caller.setActive({
        workspaceId: "ws_123",
        installId: null,
      });

      expect(result.success).toBe(true);
      expect(mockTx.extensionInstall.updateMany).toHaveBeenCalled();
      expect(mockTx.extensionInstall.update).not.toHaveBeenCalled();
    });

    it("throws NOT_FOUND for non-existent install", async () => {
      const caller = createTestCaller();
      vi.mocked(prisma.extensionInstall.findFirst).mockResolvedValue(null);

      await expect(
        caller.setActive({
          workspaceId: "ws_123",
          installId: "nonexistent",
        })
      ).rejects.toThrow(TRPCError);
    });

    it("requires admin role", async () => {
      const caller = createTestCaller(mockMemberSession);

      await expect(
        caller.setActive({
          workspaceId: "ws_123",
          installId: "inst_theme_456",
        })
      ).rejects.toThrow(TRPCError);
    });
  });

  // ============================================================
  // saveConfig
  // ============================================================
  describe("saveConfig", () => {
    it("updates theme configuration", async () => {
      const caller = createTestCaller();

      vi.mocked(prisma.extensionInstall.findFirst).mockResolvedValue(
        mockThemeInstall as unknown as Awaited<
          ReturnType<typeof prisma.extensionInstall.findFirst>
        >
      );

      const mockTx = {
        extensionInstall: {
          update: vi.fn().mockResolvedValue({
            ...mockThemeInstall,
            configJson: {
              version: "1.0",
              cssVars: { primary: "262.1 83.3% 57.8%" },
            },
          }),
        },
        extensionAuditLog: {
          create: vi.fn().mockResolvedValue({}),
        },
      };

      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        if (typeof callback === "function") {
          return callback(mockTx as unknown as Parameters<typeof callback>[0]);
        }
        return Promise.resolve(callback);
      });

      const result = await caller.saveConfig({
        workspaceId: "ws_123",
        installId: "inst_theme_123",
        config: {
          version: "1.0",
          cssVars: {
            primary: "262.1 83.3% 57.8%",
          },
        },
      });

      expect(result.success).toBe(true);
      expect(mockTx.extensionInstall.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "inst_theme_123" },
        })
      );
    });

    it("throws NOT_FOUND for non-existent install", async () => {
      const caller = createTestCaller();
      vi.mocked(prisma.extensionInstall.findFirst).mockResolvedValue(null);

      await expect(
        caller.saveConfig({
          workspaceId: "ws_123",
          installId: "nonexistent",
          config: { version: "1.0" },
        })
      ).rejects.toThrow(TRPCError);
    });

    it("requires admin role", async () => {
      const caller = createTestCaller(mockMemberSession);

      await expect(
        caller.saveConfig({
          workspaceId: "ws_123",
          installId: "inst_theme_123",
          config: { version: "1.0" },
        })
      ).rejects.toThrow(TRPCError);
    });
  });

  // ============================================================
  // listInstalled
  // ============================================================
  describe("listInstalled", () => {
    it("returns list of installed THEME extensions", async () => {
      const caller = createTestCaller();
      vi.mocked(prisma.extensionInstall.findMany).mockResolvedValue([
        mockThemeInstall as unknown as Awaited<
          ReturnType<typeof prisma.extensionInstall.findMany>
        >[0],
        mockDisabledThemeInstall as unknown as Awaited<
          ReturnType<typeof prisma.extensionInstall.findMany>
        >[0],
      ]);

      const result = await caller.listInstalled({ workspaceId: "ws_123" });

      expect(result).toHaveLength(2);
      expect(result[0]?.id).toBe("inst_theme_123");
      expect(result[0]?.enabled).toBe(true);
      expect(result[1]?.enabled).toBe(false);
    });

    it("returns empty array when no themes installed", async () => {
      const caller = createTestCaller();
      vi.mocked(prisma.extensionInstall.findMany).mockResolvedValue([]);

      const result = await caller.listInstalled({ workspaceId: "ws_123" });

      expect(result).toEqual([]);
    });

    it("requires authentication", async () => {
      const caller = createTestCaller(null);

      await expect(
        caller.listInstalled({ workspaceId: "ws_123" })
      ).rejects.toThrow(TRPCError);
    });

    it("queries only THEME type extensions", async () => {
      const caller = createTestCaller();
      vi.mocked(prisma.extensionInstall.findMany).mockResolvedValue([]);

      await caller.listInstalled({ workspaceId: "ws_123" });

      expect(prisma.extensionInstall.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            extension: { type: "THEME" },
          }),
        })
      );
    });
  });

  // ============================================================
  // getPresets
  // ============================================================
  describe("getPresets", () => {
    it("returns available theme presets", async () => {
      const caller = createTestCaller();

      const result = await caller.getPresets();

      expect(result).toHaveLength(6);
      expect(result.map((p) => p.key)).toContain("default");
      expect(result.map((p) => p.key)).toContain("dark");
      expect(result.map((p) => p.key)).toContain("blue");
      expect(result.map((p) => p.key)).toContain("pink");
    });

    it("each preset has name, description, and config", async () => {
      const caller = createTestCaller();

      const result = await caller.getPresets();

      for (const preset of result) {
        expect(preset.name).toBeDefined();
        expect(preset.description).toBeDefined();
        expect(preset.config).toBeDefined();
      }
    });

    it("requires authentication", async () => {
      const caller = createTestCaller(null);

      await expect(caller.getPresets()).rejects.toThrow(TRPCError);
    });
  });
});
