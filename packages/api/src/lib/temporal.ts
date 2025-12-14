/**
 * Temporal Client for API Package
 *
 * Provides a singleton Temporal client for triggering workflows from tRPC routers.
 * Used by the GitHub router to start repository indexing workflows.
 */

import { Client, Connection, WorkflowNotFoundError } from "@temporalio/client";

let _client: Client | null = null;
let _connectionPromise: Promise<Connection> | null = null;

/**
 * Get the Temporal address from environment.
 * Defaults to localhost:7233 for local development.
 */
function getTemporalAddress(): string {
  return process.env.TEMPORAL_ADDRESS ?? "localhost:7233";
}

/**
 * Get the Temporal task queue from environment.
 * Defaults to cognobserve-tasks.
 */
function getTaskQueue(): string {
  return process.env.TEMPORAL_TASK_QUEUE ?? "cognobserve-tasks";
}

/**
 * Get the Temporal client singleton.
 * Creates a connection on first call and reuses it for subsequent calls.
 *
 * @returns Temporal client instance
 */
export async function getTemporalClient(): Promise<Client> {
  if (_client) return _client;

  // Create connection if not already in progress
  if (!_connectionPromise) {
    const address = getTemporalAddress();
    console.log(`[Temporal] Connecting to ${address}`);

    _connectionPromise = Connection.connect({ address });
  }

  const connection = await _connectionPromise;
  _client = new Client({ connection });

  console.log("[Temporal] Client connected");
  return _client;
}

/**
 * Close the Temporal client connection.
 * Should be called during graceful shutdown.
 */
export async function closeTemporalClient(): Promise<void> {
  if (_client) {
    const connection = _client.connection;
    _client = null;
    _connectionPromise = null;
    await connection.close();
    console.log("[Temporal] Client connection closed");
  }
}

export { getTaskQueue, WorkflowNotFoundError };
