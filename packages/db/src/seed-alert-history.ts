/**
 * Seed script to create mock alert history data for UI testing
 */

import { prisma } from "./index.js";

async function main() {
  console.log("Seeding alert history data...");

  // Get the first project
  const project = await prisma.project.findFirst({
    select: { id: true, name: true },
  });

  if (!project) {
    console.error("No project found. Please create a project first.");
    process.exit(1);
  }

  console.log(`Using project: ${project.name} (${project.id})`);

  // Delete existing alerts and create new ones
  console.log("Deleting existing alerts...");
  await prisma.alert.deleteMany({
    where: { projectId: project.id },
  });

  console.log("Creating mock alerts...");

  const alertsData = [
    {
      projectId: project.id,
      name: "High Error Rate",
      type: "ERROR_RATE" as const,
      threshold: 5,
      operator: "GREATER_THAN" as const,
      windowMins: 5,
      cooldownMins: 60,
      enabled: true,
    },
    {
      projectId: project.id,
      name: "Slow Response P95",
      type: "LATENCY_P95" as const,
      threshold: 2000,
      operator: "GREATER_THAN" as const,
      windowMins: 5,
      cooldownMins: 30,
      enabled: true,
    },
    {
      projectId: project.id,
      name: "Critical Latency P99",
      type: "LATENCY_P99" as const,
      threshold: 5000,
      operator: "GREATER_THAN" as const,
      windowMins: 10,
      cooldownMins: 60,
      enabled: true,
    },
    {
      projectId: project.id,
      name: "API Latency P50",
      type: "LATENCY_P50" as const,
      threshold: 500,
      operator: "GREATER_THAN" as const,
      windowMins: 5,
      cooldownMins: 15,
      enabled: true,
    },
  ];

  for (const data of alertsData) {
    await prisma.alert.create({ data });
  }

  const alerts = await prisma.alert.findMany({
    where: { projectId: project.id },
  });

  console.log(`Found ${alerts.length} alerts`);

  // Create mock history entries
  const now = new Date();
  const historyData = [];

  for (const alert of alerts) {
    // Create 5-10 history entries per alert
    const numEntries = Math.floor(Math.random() * 6) + 5;

    for (let i = 0; i < numEntries; i++) {
      // Random time in the past (0-7 days)
      const hoursAgo = Math.floor(Math.random() * 168); // 7 days in hours
      const triggeredAt = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000);

      // Generate value based on alert type
      let value: number;
      if (alert.type === "ERROR_RATE") {
        value = alert.threshold * (1 + Math.random() * 0.5); // 100-150% of threshold
      } else {
        value = alert.threshold * (1 + Math.random() * 0.3); // 100-130% of threshold
      }

      // Some are resolved, some are not
      const resolved = Math.random() > 0.3;
      const resolvedAt = resolved
        ? new Date(triggeredAt.getTime() + Math.random() * 2 * 60 * 60 * 1000) // 0-2 hours after trigger
        : null;

      // Random notification channels
      const channels = [];
      if (Math.random() > 0.3) channels.push("GMAIL");
      if (Math.random() > 0.5) channels.push("DISCORD");

      historyData.push({
        alertId: alert.id,
        triggeredAt,
        value: Math.round(value * 100) / 100,
        threshold: alert.threshold,
        resolved,
        resolvedAt,
        notifiedVia: channels,
      });
    }
  }

  // Sort by triggeredAt descending
  historyData.sort((a, b) => b.triggeredAt.getTime() - a.triggeredAt.getTime());

  // Delete existing history and insert new
  await prisma.alertHistory.deleteMany({
    where: { alert: { projectId: project.id } },
  });

  console.log(`Creating ${historyData.length} history entries...`);

  for (const data of historyData) {
    await prisma.alertHistory.create({ data });
  }

  console.log("Done! Mock alert history data created.");

  // Print summary
  const history = await prisma.alertHistory.findMany({
    where: { alert: { projectId: project.id } },
    include: { alert: { select: { name: true, type: true } } },
    orderBy: { triggeredAt: "desc" },
    take: 10,
  });

  console.log("\nRecent alert history:");
  for (const h of history) {
    console.log(
      `  - ${h.alert.name} (${h.alert.type}): ${h.value} at ${h.triggeredAt.toISOString()}`
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
