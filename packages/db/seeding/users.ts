/**
 * Seed Script: Tracked Users
 *
 * Creates sample tracked users (end-users of AI applications) with:
 * - Realistic user profiles (names, emails, metadata)
 * - Links to existing sessions and traces
 * - Varied activity patterns (active, casual, churned users)
 */

import { prisma, Prisma } from "../src/index.js";

// Configuration
const USER_COUNT = 50;

// Sample user data for realistic profiles
const FIRST_NAMES = [
  "James", "Emma", "Oliver", "Sophia", "William", "Ava", "Benjamin", "Isabella",
  "Lucas", "Mia", "Henry", "Charlotte", "Alexander", "Amelia", "Daniel", "Harper",
  "Matthew", "Evelyn", "Sebastian", "Abigail", "Jack", "Emily", "Aiden", "Elizabeth",
  "Owen", "Sofia", "Samuel", "Avery", "Ryan", "Ella", "Nathan", "Scarlett",
  "Leo", "Grace", "Isaac", "Chloe", "Ethan", "Victoria", "Levi", "Riley",
];

const LAST_NAMES = [
  "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
  "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson",
  "Thomas", "Taylor", "Moore", "Jackson", "Martin", "Lee", "Perez", "Thompson",
  "White", "Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson",
];

const EMAIL_DOMAINS = [
  "gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com",
  "company.com", "enterprise.io", "startup.co", "tech.dev", "business.org",
];

const PLANS = ["free", "starter", "pro", "enterprise"] as const;
const COMPANIES = [
  "Acme Corp", "TechStart Inc", "Global Solutions", "Digital Dynamics",
  "Cloud Nine", "Data Driven Co", "AI First Labs", "Smart Systems",
  "Innovation Hub", "Future Tech", null, null, null, // Some users without company
];

const ROLES = ["developer", "product_manager", "data_scientist", "designer", "executive", "analyst"];
const SOURCES = ["organic", "referral", "paid_ads", "social", "content", "partner"];

// Helper functions
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

function generateExternalUserId(): string {
  return `user_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
}

function generateEmail(firstName: string, lastName: string): string {
  const formats = [
    `${firstName.toLowerCase()}.${lastName.toLowerCase()}`,
    `${firstName.toLowerCase()}${lastName.toLowerCase()}`,
    `${firstName.toLowerCase()}_${lastName.toLowerCase()}`,
    `${firstName.toLowerCase()}${randomInt(1, 99)}`,
  ];
  return `${randomChoice(formats)}@${randomChoice(EMAIL_DOMAINS)}`;
}

interface GeneratedUser {
  externalId: string;
  name: string;
  email: string;
  metadata: Record<string, unknown>;
  firstSeenAt: Date;
  lastSeenAt: Date;
  activityType: "active" | "casual" | "churned";
}

function generateUser(index: number): GeneratedUser {
  const firstName = randomChoice(FIRST_NAMES);
  const lastName = randomChoice(LAST_NAMES);
  const name = `${firstName} ${lastName}`;
  const email = generateEmail(firstName, lastName);

  // Determine user activity type
  // 40% active (seen in last 7 days), 35% casual (7-30 days), 25% churned (30+ days)
  const activityRoll = Math.random();
  let activityType: "active" | "casual" | "churned";
  let firstSeenHoursAgo: number;
  let lastSeenHoursAgo: number;

  if (activityRoll < 0.4) {
    // Active users - first seen 1-60 days ago, last seen 0-7 days ago
    activityType = "active";
    firstSeenHoursAgo = randomInt(24, 1440); // 1-60 days
    lastSeenHoursAgo = randomInt(0, 168); // 0-7 days
  } else if (activityRoll < 0.75) {
    // Casual users - first seen 14-90 days ago, last seen 7-30 days ago
    activityType = "casual";
    firstSeenHoursAgo = randomInt(336, 2160); // 14-90 days
    lastSeenHoursAgo = randomInt(168, 720); // 7-30 days
  } else {
    // Churned users - first seen 30-120 days ago, last seen 30-90 days ago
    activityType = "churned";
    firstSeenHoursAgo = randomInt(720, 2880); // 30-120 days
    lastSeenHoursAgo = randomInt(720, 2160); // 30-90 days
  }

  // Ensure firstSeen is before lastSeen
  if (firstSeenHoursAgo < lastSeenHoursAgo) {
    firstSeenHoursAgo = lastSeenHoursAgo + randomInt(24, 720);
  }

  const metadata: Record<string, unknown> = {
    plan: randomChoice(PLANS),
    role: randomChoice(ROLES),
    source: randomChoice(SOURCES),
    signupVersion: `v${randomInt(1, 3)}.${randomInt(0, 9)}`,
  };

  // Add optional fields
  const company = randomChoice(COMPANIES);
  if (company) {
    metadata.company = company;
  }

  if (Math.random() > 0.3) {
    metadata.timezone = randomChoice([
      "America/New_York", "America/Los_Angeles", "Europe/London",
      "Europe/Paris", "Asia/Tokyo", "Asia/Singapore", "Australia/Sydney",
    ]);
  }

  if (Math.random() > 0.5) {
    metadata.preferences = {
      theme: randomChoice(["light", "dark", "system"]),
      notifications: Math.random() > 0.3,
      language: randomChoice(["en", "es", "fr", "de", "ja", "zh"]),
    };
  }

  return {
    externalId: generateExternalUserId(),
    name,
    email,
    metadata,
    firstSeenAt: hoursAgo(firstSeenHoursAgo),
    lastSeenAt: hoursAgo(lastSeenHoursAgo),
    activityType,
  };
}

export async function seedUsers() {
  console.log("Seeding tracked users...\n");

  // Get the first project
  const project = await prisma.project.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });

  if (!project) {
    console.log("No project found. Please create a project first.");
    process.exit(1);
  }

  console.log(`Using project: ${project.name} (${project.id})\n`);

  // Check existing user count
  const existingCount = await prisma.trackedUser.count({
    where: { projectId: project.id },
  });

  if (existingCount > 0) {
    console.log(`Found ${existingCount} existing tracked users.`);
    console.log("Deleting existing tracked users...\n");
    await prisma.trackedUser.deleteMany({ where: { projectId: project.id } });
  }

  // Generate users
  console.log(`Creating ${USER_COUNT} tracked users...\n`);

  const users: GeneratedUser[] = [];
  for (let i = 0; i < USER_COUNT; i++) {
    users.push(generateUser(i));
  }

  // Create users in database using createMany for better performance
  await prisma.trackedUser.createMany({
    data: users.map((user) => ({
      projectId: project.id,
      externalId: user.externalId,
      name: user.name,
      email: user.email,
      metadata: user.metadata as Prisma.InputJsonValue,
      firstSeenAt: user.firstSeenAt,
      lastSeenAt: user.lastSeenAt,
    })),
  });

  // Count activity types
  const activeCount = users.filter((u) => u.activityType === "active").length;
  const casualCount = users.filter((u) => u.activityType === "casual").length;
  const churnedCount = users.filter((u) => u.activityType === "churned").length;

  // Link some users to existing sessions
  const createdUsers = await prisma.trackedUser.findMany({
    where: { projectId: project.id },
    select: { id: true, name: true },
  });

  const sessions = await prisma.traceSession.findMany({
    where: { projectId: project.id, userId: null },
    select: { id: true },
    take: Math.min(createdUsers.length * 3, 150), // Up to 3 sessions per user
  });

  let linkedSessions = 0;
  for (const session of sessions) {
    // 70% chance to link to a user
    if (Math.random() > 0.3) {
      const randomUser = randomChoice(createdUsers);
      await prisma.traceSession.update({
        where: { id: session.id },
        data: { userId: randomUser.id },
      });
      linkedSessions++;
    }
  }

  // Link some traces to users (those without sessions)
  const traces = await prisma.trace.findMany({
    where: { projectId: project.id, userId: null, sessionId: null },
    select: { id: true },
    take: Math.min(createdUsers.length * 5, 250),
  });

  let linkedTraces = 0;
  for (const trace of traces) {
    // 60% chance to link to a user
    if (Math.random() > 0.4) {
      const randomUser = randomChoice(createdUsers);
      await prisma.trace.update({
        where: { id: trace.id },
        data: { userId: randomUser.id },
      });
      linkedTraces++;
    }
  }

  // Print summary
  console.log("\nSeeding complete!\n");
  console.log("=== Summary ===");
  console.log(`Users created: ${USER_COUNT}`);
  console.log(`  - Active (last 7 days): ${activeCount}`);
  console.log(`  - Casual (7-30 days): ${casualCount}`);
  console.log(`  - Churned (30+ days): ${churnedCount}`);
  console.log(`Sessions linked to users: ${linkedSessions}`);
  console.log(`Traces linked to users: ${linkedTraces}`);

  // Show sample users
  const sampleUsers = await prisma.trackedUser.findMany({
    where: { projectId: project.id },
    include: {
      _count: { select: { sessions: true, traces: true } },
    },
    orderBy: { lastSeenAt: "desc" },
    take: 5,
  });

  console.log("\n=== Recent Users ===");
  for (const user of sampleUsers) {
    console.log(
      `  - ${user.name} (${user.email}) - ${user._count.sessions} sessions, ${user._count.traces} traces`
    );
  }
}
