// ============================================================
// TEMPORAL WORKER - Factory for creating workflow/activity workers
// ============================================================
// Use createTemporalWorker() to create and configure a worker.
// Use runTemporalWorker() to start the worker (blocks until shutdown).
// Use shutdownTemporalWorker() for graceful shutdown.
// ============================================================

import { Worker, NativeConnection } from "@temporalio/worker";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { env } from "../lib/env";
import * as activities from "./activities";

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let workerInstance: Worker | null = null;
let connectionInstance: NativeConnection | null = null;

/**
 * Create a Temporal worker configured for Ducsigr.
 * The worker handles both workflows and activities.
 */
export async function createTemporalWorker(): Promise<Worker> {
  if (workerInstance) {
    return workerInstance;
  }

  console.log(`[Temporal Worker] Connecting to ${env.TEMPORAL_ADDRESS}...`);

  connectionInstance = await NativeConnection.connect({
    address: env.TEMPORAL_ADDRESS,
  });

  // Path to workflows module (ESM compatible)
  const workflowsPath = resolve(__dirname, "../workflows/index.ts");

  // Note: workflowsPath must be a path to a file that exports workflows
  // Temporal will bundle this file separately for workflow isolation
  workerInstance = await Worker.create({
    connection: connectionInstance,
    namespace: env.TEMPORAL_NAMESPACE,
    taskQueue: env.TEMPORAL_TASK_QUEUE,
    // Path to workflows module (will be bundled by Temporal)
    workflowsPath,
    // Activities are passed directly (run in worker process)
    activities,
    // Bundler options - ignore crypto from shared package (used by api-keys, not workflows)
    bundlerOptions: {
      ignoreModules: ["crypto"],
    },
    // Performance tuning
    maxConcurrentActivityTaskExecutions: 100,
    maxConcurrentWorkflowTaskExecutions: 100,
    // Graceful shutdown timeout
    shutdownGraceTime: "30s",
  });

  console.log(`[Temporal Worker] Created worker for task queue: ${env.TEMPORAL_TASK_QUEUE}`);

  return workerInstance;
}

/**
 * Run the Temporal worker.
 * This method blocks until the worker is shut down.
 */
export async function runTemporalWorker(): Promise<void> {
  const worker = await createTemporalWorker();
  console.log("[Temporal Worker] Starting worker...");
  await worker.run();
  console.log("[Temporal Worker] Worker stopped");
}

/**
 * Gracefully shutdown the Temporal worker.
 * Call this during process shutdown.
 */
export function shutdownTemporalWorker(): void {
  if (workerInstance) {
    console.log("[Temporal Worker] Initiating graceful shutdown...");
    workerInstance.shutdown();
  }
}

/**
 * Close the worker connection.
 * Call this after shutdownTemporalWorker() completes.
 */
export async function closeWorkerConnection(): Promise<void> {
  if (connectionInstance) {
    await connectionInstance.close();
    connectionInstance = null;
    workerInstance = null;
    console.log("[Temporal Worker] Connection closed");
  }
}
