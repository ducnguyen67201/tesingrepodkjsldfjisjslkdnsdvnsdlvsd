import { APP_NAME, APP_VERSION } from "@ducsigr/shared";

// Temporal imports
import {
  runTemporalWorker,
  shutdownTemporalWorker,
  closeTemporalClient,
} from "@/temporal";

// Workflow startup
import { startAllWorkflows } from "@/startup";

console.log(`Starting ${APP_NAME} Worker v${APP_VERSION}`);

async function main() {
  console.log("Starting Temporal worker...");

  // Start Temporal worker in background (non-blocking)
  // We need the worker running before we can start workflows
  const workerPromise = runTemporalWorker();

  // Wait for worker to connect and be ready
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Start all persistent workflows (alerts, schedules, etc.)
  try {
    await startAllWorkflows();
  } catch (error) {
    console.error("Failed to start workflows:", error);
    // Continue anyway - workflows can be started manually
  }

  console.log("Temporal worker initialized and processing workflows");

  // Graceful shutdown handler
  const handleShutdown = async () => {
    console.log("Shutting down Temporal worker...");
    await shutdownTemporalWorker();
    closeTemporalClient();
    process.exit(0);
  };

  process.on("SIGINT", handleShutdown);
  process.on("SIGTERM", handleShutdown);

  // Wait for worker to complete (runs until shutdown)
  await workerPromise;
}

main().catch((error) => {
  console.error("Worker failed to start:", error);
  process.exit(1);
});
