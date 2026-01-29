import { Worker } from "bullmq";
import { createConnection } from "@t3/queue";
import { emailProcessor } from "./processors/email.js";
import { notificationProcessor } from "./processors/notification.js";

const connection = createConnection();

console.log("Starting worker...");

// Email worker
const emailWorker = new Worker("email", emailProcessor, {
  connection,
  concurrency: 5,
});

emailWorker.on("completed", (job) => {
  console.log(`[email] Job ${job.id} completed`);
});

emailWorker.on("failed", (job, error) => {
  console.error(`[email] Job ${job?.id} failed:`, error.message);
});

// Notification worker
const notificationWorker = new Worker("notification", notificationProcessor, {
  connection,
  concurrency: 10,
});

notificationWorker.on("completed", (job) => {
  console.log(`[notification] Job ${job.id} completed`);
});

notificationWorker.on("failed", (job, error) => {
  console.error(`[notification] Job ${job?.id} failed:`, error.message);
});

console.log("Worker started. Waiting for jobs...");

// Graceful shutdown
async function shutdown() {
  console.log("\nShutting down workers...");
  await Promise.all([emailWorker.close(), notificationWorker.close()]);
  await connection.quit();
  console.log("Workers shut down gracefully.");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
