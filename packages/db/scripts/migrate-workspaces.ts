/**
 * Data migration script: Creates personal workspaces for existing users
 *
 * Run with: npx tsx scripts/migrate-workspaces.ts
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import "dotenv/config";

function parseConnectionString(url: string) {
  const parsed = new URL(url);
  return {
    user: parsed.username,
    password: parsed.password,
    host: parsed.hostname,
    port: parseInt(parsed.port || "5432", 10),
    database: parsed.pathname.slice(1),
  };
}

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  const config = parseConnectionString(connectionString);
  const pool = new pg.Pool(config);
  const adapter = new PrismaPg(pool);

  return new PrismaClient({ adapter });
}

const prisma = createPrismaClient();

async function migrateToWorkspaces() {
  console.log("Starting workspace migration...");

  // Get all users who own at least one project
  const usersWithProjects = await prisma.user.findMany({
    where: {
      projects: {
        some: {
          role: "OWNER",
        },
      },
    },
    include: {
      projects: {
        where: { role: "OWNER" },
        include: { project: true },
      },
    },
  });

  console.log(`Found ${usersWithProjects.length} users with owned projects`);

  let migratedCount = 0;
  let projectsLinked = 0;

  for (const user of usersWithProjects) {
    // Check if user already has a personal workspace
    const existingWorkspace = await prisma.workspaceMember.findFirst({
      where: {
        userId: user.id,
        workspace: { isPersonal: true },
      },
    });

    if (existingWorkspace) {
      console.log(`User ${user.id} already has a personal workspace, skipping`);
      continue;
    }

    // Create personal workspace for user
    const workspaceName = user.name ? `${user.name}'s Workspace` : "Personal";
    const workspaceSlug = `user-${user.id.slice(-8)}`;

    const workspace = await prisma.workspace.create({
      data: {
        name: workspaceName,
        slug: workspaceSlug,
        isPersonal: true,
        members: {
          create: {
            userId: user.id,
            role: "OWNER",
          },
        },
      },
    });

    console.log(`Created workspace "${workspaceName}" (${workspace.id}) for user ${user.id}`);

    // Link user's owned projects to their personal workspace
    const ownedProjectIds = user.projects.map((pm) => pm.projectId);

    if (ownedProjectIds.length > 0) {
      const updateResult = await prisma.project.updateMany({
        where: {
          id: { in: ownedProjectIds },
          workspaceId: null, // Only update projects not yet assigned
        },
        data: { workspaceId: workspace.id },
      });

      projectsLinked += updateResult.count;
      console.log(`  Linked ${updateResult.count} projects to workspace`);
    }

    migratedCount++;
  }

  // Also create workspaces for users without projects (they need one too)
  const usersWithoutWorkspace = await prisma.user.findMany({
    where: {
      workspaces: { none: {} },
    },
  });

  console.log(`\nFound ${usersWithoutWorkspace.length} users without workspaces`);

  for (const user of usersWithoutWorkspace) {
    const workspaceName = user.name ? `${user.name}'s Workspace` : "Personal";
    const workspaceSlug = `user-${user.id.slice(-8)}`;

    await prisma.workspace.create({
      data: {
        name: workspaceName,
        slug: workspaceSlug,
        isPersonal: true,
        members: {
          create: {
            userId: user.id,
            role: "OWNER",
          },
        },
      },
    });

    migratedCount++;
  }

  console.log("\n========================================");
  console.log("Migration complete!");
  console.log(`  Users migrated: ${migratedCount}`);
  console.log(`  Projects linked: ${projectsLinked}`);
  console.log("========================================");

  // Check for orphaned projects (projects without workspace)
  const orphanedProjects = await prisma.project.count({
    where: { workspaceId: null },
  });

  if (orphanedProjects > 0) {
    console.warn(`\nWARNING: ${orphanedProjects} projects still have no workspace!`);
    console.warn("These need manual assignment before making workspaceId required.");
  }
}

migrateToWorkspaces()
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
