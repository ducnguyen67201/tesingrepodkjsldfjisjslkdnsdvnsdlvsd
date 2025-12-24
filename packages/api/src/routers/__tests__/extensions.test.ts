import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { createCallerFactory } from "../../trpc";
import type { SessionWithWorkspaces } from "../../context";

// Mock prisma
vi.mock("@cognobserve/db", () => ({
  prisma: {
    extension: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    extensionVersion: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    extensionInstall: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    extensionAuditLog: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    workspaceMember: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    $transaction: vi.fn((callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        extensionInstall: {
          create: vi.fn(),
          update: vi.fn(),
          delete: vi.fn(),
        },
        extensionAuditLog: {
          create: vi.fn(),
        },
      })
    ),
  },
}));

// Mock extension type registry
vi.mock("../../lib/extensions/registry", () => ({
  getExtensionHandler: vi.fn(() => ({
    type: "THEME",
    requiredPermissions: ["ui:theme"],
    validateManifest: vi.fn(() => ({ success: true })),
    validateConfig: vi.fn(() => ({ success: true })),
    onInstall: vi.fn(async () => ({ success: true })),
    onEnable: vi.fn(async () => ({ success: true })),
    onDisable: vi.fn(async () => ({ success: true })),
    onUninstall: vi.fn(async () => ({ success: true })),
    onConfigure: vi.fn(async () => ({ success: true })),
  })),
  ExtensionTypeRegistry: {
    get: vi.fn(),
    has: vi.fn(() => true),
    register: vi.fn(),
    getRegisteredTypes: vi.fn(() => ["THEME", "INGESTION"]),
  },
}));

// Import after mocks
import { prisma } from "@cognobserve/db";
import { extensionsRouter } from "../extensions";

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

const mockSession: SessionWithWorkspaces = {
  user: {
    ...mockUser,
    workspaces: [mockWorkspace],
    projects: [],
  },
  expires: new Date(Date.now() + 86400000).toISOString(),
};

const mockExtension = {
  id: "ext_123",
  slug: "com.example.test-theme",
  name: "Test Theme",
  description: "A test theme extension",
  type: "THEME" as const,
  visibility: "PUBLIC" as const,
  ownerId: "user_456",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockVersion = {
  id: "ver_123",
  extensionId: "ext_123",
  version: "1.0.0",
  manifest: {
    id: "com.example.test-theme",
    name: "Test Theme",
    version: "1.0.0",
    type: "THEME",
    permissions: ["ui:theme"],
  },
  entry: null,
  changelog: null,
  deprecated: false,
  createdAt: new Date(),
};

const mockInstall = {
  id: "inst_123",
  workspaceId: "ws_123",
  extensionId: "ext_123",
  extensionVersionId: "ver_123",
  enabled: true,
  configJson: {},
  approvedPermissions: ["ui:theme"],
  installedById: "user_123",
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ============================================================
// TEST HELPERS
// ============================================================

const createCaller = createCallerFactory(extensionsRouter);

const createTestCaller = (session: SessionWithWorkspaces | null = mockSession) => {
  return createCaller({ session });
};

// ============================================================
// TESTS
// ============================================================

describe("extensionsRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================
  // list
  // ============================================================
  describe("list", () => {
    it("returns list of extensions", async () => {
      const caller = createTestCaller();
      vi.mocked(prisma.extension.findMany).mockResolvedValue([
        {
          ...mockExtension,
          versions: [mockVersion],
          installs: [],
        } as unknown as Awaited<ReturnType<typeof prisma.extension.findMany>>[0],
      ]);

      const result = await caller.list({});

      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe(mockExtension.id);
      expect(result[0]!.name).toBe(mockExtension.name);
      expect(result[0]!.type).toBe("THEME");
    });

    it("filters by type", async () => {
      const caller = createTestCaller();
      vi.mocked(prisma.extension.findMany).mockResolvedValue([]);

      await caller.list({ type: "THEME" });

      // Query uses AND array structure with visibility + type filters
      expect(prisma.extension.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              expect.objectContaining({ type: "THEME" }),
            ]),
          }),
        })
      );
    });

    it("filters by search term", async () => {
      const caller = createTestCaller();
      vi.mocked(prisma.extension.findMany).mockResolvedValue([]);

      await caller.list({ search: "dark mode" });

      // Query uses AND array structure with visibility + search filters
      expect(prisma.extension.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              expect.objectContaining({
                OR: expect.arrayContaining([
                  expect.objectContaining({ name: expect.anything() }),
                  expect.objectContaining({ description: expect.anything() }),
                ]),
              }),
            ]),
          }),
        })
      );
    });

    it("includes install status when workspaceSlug provided", async () => {
      const caller = createTestCaller();
      vi.mocked(prisma.extension.findMany).mockResolvedValue([
        {
          ...mockExtension,
          versions: [mockVersion],
          installs: [mockInstall],
        } as unknown as Awaited<ReturnType<typeof prisma.extension.findMany>>[0],
      ]);

      const result = await caller.list({ workspaceSlug: "test-workspace" });

      expect(result[0]!.isInstalled).toBe(true);
      expect(result[0]!.install).toBeDefined();
    });

    it("requires authentication", async () => {
      const caller = createTestCaller(null);

      await expect(caller.list({})).rejects.toThrow(TRPCError);
    });
  });

  // ============================================================
  // getById
  // ============================================================
  describe("getById", () => {
    it("returns extension with versions", async () => {
      const caller = createTestCaller();
      vi.mocked(prisma.extension.findUnique).mockResolvedValue({
        ...mockExtension,
        versions: [mockVersion],
        owner: { id: mockUser.id, name: mockUser.name, email: mockUser.email },
        installs: [],
      } as unknown as Awaited<ReturnType<typeof prisma.extension.findUnique>>);

      const result = await caller.getById({ extensionId: "ext_123" });

      expect(result).toBeDefined();
      expect(result?.id).toBe("ext_123");
      expect(result?.versions).toHaveLength(1);
    });

    it("throws NOT_FOUND for non-existent extension", async () => {
      const caller = createTestCaller();
      vi.mocked(prisma.extension.findUnique).mockResolvedValue(null);

      await expect(caller.getById({ extensionId: "nonexistent" })).rejects.toThrow(
        TRPCError
      );
    });

    it("requires authentication", async () => {
      const caller = createTestCaller(null);

      await expect(caller.getById({ extensionId: "ext_123" })).rejects.toThrow(
        TRPCError
      );
    });
  });

  // ============================================================
  // install
  // ============================================================
  describe("install", () => {
    it("installs extension to workspace", async () => {
      const caller = createTestCaller();

      vi.mocked(prisma.extension.findUnique).mockResolvedValue({
        ...mockExtension,
        versions: [mockVersion],
      } as unknown as Awaited<ReturnType<typeof prisma.extension.findUnique>>);

      vi.mocked(prisma.extensionVersion.findUnique).mockResolvedValue(mockVersion);

      vi.mocked(prisma.extensionInstall.findUnique).mockResolvedValue(null);

      const mockCreatedInstall = {
        ...mockInstall,
        id: "new_inst_123",
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
        const tx = {
          extensionInstall: {
            create: vi.fn().mockResolvedValue(mockCreatedInstall),
          },
          extensionAuditLog: {
            create: vi.fn().mockResolvedValue({}),
          },
        };
        return callback(tx);
      });

      const result = await caller.install({
        workspaceId: "ws_123",
        extensionId: "ext_123",
        approvedPermissions: ["ui:theme"],
      });

      expect(result).toBeDefined();
      expect(result.id).toBe("new_inst_123");
    });

    it("rejects if extension already installed", async () => {
      const caller = createTestCaller();

      vi.mocked(prisma.extension.findUnique).mockResolvedValue({
        ...mockExtension,
        versions: [mockVersion],
      } as unknown as Awaited<ReturnType<typeof prisma.extension.findUnique>>);

      vi.mocked(prisma.extensionVersion.findUnique).mockResolvedValue(mockVersion);

      // Already installed
      vi.mocked(prisma.extensionInstall.findUnique).mockResolvedValue(mockInstall);

      await expect(
        caller.install({
          workspaceId: "ws_123",
          extensionId: "ext_123",
          approvedPermissions: ["ui:theme"],
        })
      ).rejects.toThrow(TRPCError);
    });

    it("rejects if required permissions not approved", async () => {
      const caller = createTestCaller();

      vi.mocked(prisma.extension.findUnique).mockResolvedValue({
        ...mockExtension,
        versions: [mockVersion],
      } as unknown as Awaited<ReturnType<typeof prisma.extension.findUnique>>);

      vi.mocked(prisma.extensionVersion.findUnique).mockResolvedValue(mockVersion);
      vi.mocked(prisma.extensionInstall.findUnique).mockResolvedValue(null);

      await expect(
        caller.install({
          workspaceId: "ws_123",
          extensionId: "ext_123",
          approvedPermissions: [], // Missing required ui:theme
        })
      ).rejects.toThrow(TRPCError);
    });

    it("requires admin role", async () => {
      const memberSession: SessionWithWorkspaces = {
        ...mockSession,
        user: {
          ...mockSession.user,
          workspaces: [{ ...mockWorkspace, role: "MEMBER" }],
        },
      };
      const caller = createTestCaller(memberSession);

      await expect(
        caller.install({
          workspaceId: "ws_123",
          extensionId: "ext_123",
          approvedPermissions: ["ui:theme"],
        })
      ).rejects.toThrow(TRPCError);
    });
  });

  // ============================================================
  // toggle
  // ============================================================
  describe("toggle", () => {
    it("enables extension", async () => {
      const caller = createTestCaller();

      const mockInstallWithRelations = {
        ...mockInstall,
        enabled: false,
        extensionId: mockExtension.id,
        extension: mockExtension,
        version: mockVersion,
        configJson: {},
        approvedPermissions: ["ui:theme"],
      };

      // Mock the interactive transaction to execute the callback
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
        const tx = {
          extensionInstall: {
            findFirst: vi.fn().mockResolvedValue(mockInstallWithRelations),
            update: vi.fn().mockResolvedValue(mockInstallWithRelations),
          },
          extensionAuditLog: {
            create: vi.fn().mockResolvedValue({}),
          },
        };
        return callback(tx);
      });

      const result = await caller.toggle({
        workspaceId: "ws_123",
        installId: "inst_123",
        enabled: true,
      });

      expect(result.success).toBe(true);
    });

    it("disables extension", async () => {
      const caller = createTestCaller();

      const mockInstallWithRelations = {
        ...mockInstall,
        enabled: true,
        extensionId: mockExtension.id,
        extension: mockExtension,
        version: mockVersion,
        configJson: {},
        approvedPermissions: ["ui:theme"],
      };

      // Mock the interactive transaction to execute the callback
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
        const tx = {
          extensionInstall: {
            findFirst: vi.fn().mockResolvedValue(mockInstallWithRelations),
            update: vi.fn().mockResolvedValue(mockInstallWithRelations),
          },
          extensionAuditLog: {
            create: vi.fn().mockResolvedValue({}),
          },
        };
        return callback(tx);
      });

      const result = await caller.toggle({
        workspaceId: "ws_123",
        installId: "inst_123",
        enabled: false,
      });

      expect(result.success).toBe(true);
    });

    it("throws NOT_FOUND for non-existent install", async () => {
      const caller = createTestCaller();

      // Mock the interactive transaction to throw NOT_FOUND when install doesn't exist
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
        const tx = {
          extensionInstall: {
            findFirst: vi.fn().mockResolvedValue(null),
          },
        };
        return callback(tx);
      });

      await expect(
        caller.toggle({
          workspaceId: "ws_123",
          installId: "nonexistent",
          enabled: true,
        })
      ).rejects.toThrow(TRPCError);
    });

    it("requires admin role", async () => {
      const memberSession: SessionWithWorkspaces = {
        ...mockSession,
        user: {
          ...mockSession.user,
          workspaces: [{ ...mockWorkspace, role: "MEMBER" }],
        },
      };
      const caller = createTestCaller(memberSession);

      await expect(
        caller.toggle({
          workspaceId: "ws_123",
          installId: "inst_123",
          enabled: true,
        })
      ).rejects.toThrow(TRPCError);
    });
  });

  // ============================================================
  // configure
  // ============================================================
  describe("configure", () => {
    it("updates extension config", async () => {
      const caller = createTestCaller();

      vi.mocked(prisma.extensionInstall.findFirst).mockResolvedValue({
        ...mockInstall,
        extension: mockExtension,
        version: mockVersion,
      } as unknown as Awaited<ReturnType<typeof prisma.extensionInstall.findFirst>>);

      vi.mocked(prisma.$transaction).mockResolvedValue(undefined);

      const result = await caller.configure({
        workspaceId: "ws_123",
        installId: "inst_123",
        config: { theme: "dark", fontSize: 14 },
      });

      expect(result.success).toBe(true);
    });

    it("throws NOT_FOUND for non-existent install", async () => {
      const caller = createTestCaller();
      vi.mocked(prisma.extensionInstall.findFirst).mockResolvedValue(null);

      await expect(
        caller.configure({
          workspaceId: "ws_123",
          installId: "nonexistent",
          config: {},
        })
      ).rejects.toThrow(TRPCError);
    });

    it("requires admin role", async () => {
      const memberSession: SessionWithWorkspaces = {
        ...mockSession,
        user: {
          ...mockSession.user,
          workspaces: [{ ...mockWorkspace, role: "MEMBER" }],
        },
      };
      const caller = createTestCaller(memberSession);

      await expect(
        caller.configure({
          workspaceId: "ws_123",
          installId: "inst_123",
          config: {},
        })
      ).rejects.toThrow(TRPCError);
    });
  });

  // ============================================================
  // uninstall
  // ============================================================
  describe("uninstall", () => {
    it("uninstalls extension", async () => {
      const caller = createTestCaller();

      vi.mocked(prisma.extensionInstall.findFirst).mockResolvedValue({
        ...mockInstall,
        extension: mockExtension,
        version: mockVersion,
      } as unknown as Awaited<ReturnType<typeof prisma.extensionInstall.findFirst>>);

      vi.mocked(prisma.extensionInstall.delete).mockResolvedValue(mockInstall);

      const result = await caller.uninstall({
        workspaceId: "ws_123",
        installId: "inst_123",
      });

      expect(result.success).toBe(true);
    });

    it("throws NOT_FOUND for non-existent install", async () => {
      const caller = createTestCaller();
      vi.mocked(prisma.extensionInstall.findFirst).mockResolvedValue(null);

      await expect(
        caller.uninstall({
          workspaceId: "ws_123",
          installId: "nonexistent",
        })
      ).rejects.toThrow(TRPCError);
    });

    it("requires admin role", async () => {
      const memberSession: SessionWithWorkspaces = {
        ...mockSession,
        user: {
          ...mockSession.user,
          workspaces: [{ ...mockWorkspace, role: "MEMBER" }],
        },
      };
      const caller = createTestCaller(memberSession);

      await expect(
        caller.uninstall({
          workspaceId: "ws_123",
          installId: "inst_123",
        })
      ).rejects.toThrow(TRPCError);
    });
  });

  // ============================================================
  // importManifest
  // ============================================================
  describe("importManifest", () => {
    const validManifest = {
      id: "com.example.my-extension",
      name: "My Extension",
      version: "1.0.0",
      type: "THEME" as const,
      permissions: ["ui:theme" as const],
    };

    it("imports manifest and creates extension", async () => {
      const caller = createTestCaller();

      vi.mocked(prisma.extension.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.extension.create).mockResolvedValue({
        ...mockExtension,
        slug: validManifest.id,
        name: validManifest.name,
        versions: [{ ...mockVersion, version: validManifest.version }],
      } as unknown as Awaited<ReturnType<typeof prisma.extension.create>>);

      const result = await caller.importManifest({
        workspaceId: "ws_123",
        manifest: validManifest,
      });

      expect(result).toBeDefined();
      expect(result.slug).toBe(validManifest.id);
    });

    it("rejects duplicate slug", async () => {
      const caller = createTestCaller();

      vi.mocked(prisma.extension.findUnique).mockResolvedValue(mockExtension);

      await expect(
        caller.importManifest({
          workspaceId: "ws_123",
          manifest: {
            ...validManifest,
            id: mockExtension.slug,
          },
        })
      ).rejects.toThrow(TRPCError);
    });

    it("requires admin role", async () => {
      const memberSession: SessionWithWorkspaces = {
        ...mockSession,
        user: {
          ...mockSession.user,
          workspaces: [{ ...mockWorkspace, role: "MEMBER" }],
        },
      };
      const caller = createTestCaller(memberSession);

      await expect(
        caller.importManifest({
          workspaceId: "ws_123",
          manifest: validManifest,
        })
      ).rejects.toThrow(TRPCError);
    });

    it("sets default visibility to PRIVATE", async () => {
      const caller = createTestCaller();

      vi.mocked(prisma.extension.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.extension.create).mockResolvedValue({
        ...mockExtension,
        visibility: "PRIVATE",
        versions: [mockVersion],
      } as unknown as Awaited<ReturnType<typeof prisma.extension.create>>);

      await caller.importManifest({
        workspaceId: "ws_123",
        manifest: validManifest,
      });

      expect(prisma.extension.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            visibility: "PRIVATE",
          }),
        })
      );
    });
  });
});
