import type { Job } from "bullmq";
import type { NotificationJobPayload } from "@t3/shared";
import { db } from "@t3/db";

export async function notificationProcessor(job: Job<NotificationJobPayload>) {
  const { userId, message, type } = job.data;

  console.log(`[notification] Processing job ${job.id}`);
  console.log(`  User: ${userId}`);
  console.log(`  Type: ${type}`);
  console.log(`  Message: ${message}`);

  // Verify user exists
  const user = await db.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new Error(`User ${userId} not found`);
  }

  // Simulate notification delivery
  await new Promise((resolve) => setTimeout(resolve, 500));

  console.log(`[notification] Notification sent to user ${user.email}`);

  return { delivered: true, userId, timestamp: new Date().toISOString() };
}
