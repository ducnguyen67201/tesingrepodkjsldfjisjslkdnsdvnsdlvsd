// ============================================================
// TEMPORAL CLIENT - Singleton for starting workflows
// ============================================================
// Use getTemporalClient() to get the client instance.
// The client is lazily initialized on first use.
// Call closeTemporalClient() during shutdown.
// ============================================================

import { Client, Connection } from "@temporalio/client";
import { env } from "../lib/env";

let clientInstance: Client | null = null;
let connectionInstance: Connection | null = null;

/**
 * Check if connecting to Temporal Cloud (not localhost)
 */
function isTemporalCloud(): boolean {
  return (
    env.TEMPORAL_ADDRESS.includes("tmprl.cloud") ||
    env.TEMPORAL_ADDRESS.includes("temporal.io")
  );
}

/**
 * Get TLS config for Temporal Cloud
 * - API Key auth: TLS enabled, no client certs
 * - mTLS auth: TLS with client certificate pair
 */
function getTlsConfig() {
  // mTLS authentication (client certificates)
  if (env.TEMPORAL_TLS_CERT && env.TEMPORAL_TLS_KEY) {
    console.log("[Temporal] Using mTLS for Temporal Cloud");
    return {
      clientCertPair: {
        crt: Buffer.from(env.TEMPORAL_TLS_CERT),
        key: Buffer.from(env.TEMPORAL_TLS_KEY),
      },
    };
  }

  // API Key authentication (TLS without client certs)
  if (env.TEMPORAL_API_KEY && isTemporalCloud()) {
    console.log("[Temporal] Using API Key auth for Temporal Cloud");
    return true; // Enable TLS without client certs
  }

  return undefined;
}

/**
 * Get API Key header for Temporal Cloud
 */
function getApiKeyHeader(): Record<string, string> | undefined {
  if (env.TEMPORAL_API_KEY) {
    return {
      "temporal-namespace": env.TEMPORAL_NAMESPACE,
    };
  }
  return undefined;
}

/**
 * Get or create the Temporal client singleton.
 * The client is lazily initialized on first call.
 */
export async function getTemporalClient(): Promise<Client> {
  if (clientInstance) {
    return clientInstance;
  }

  console.log(`[Temporal] Connecting to ${env.TEMPORAL_ADDRESS}...`);

  const tlsConfig = getTlsConfig();

  connectionInstance = await Connection.connect({
    address: env.TEMPORAL_ADDRESS,
    tls: tlsConfig,
    metadata: getApiKeyHeader(),
    apiKey: env.TEMPORAL_API_KEY,
  });

  clientInstance = new Client({
    connection: connectionInstance,
    namespace: env.TEMPORAL_NAMESPACE,
  });

  console.log(`[Temporal] Connected to namespace: ${env.TEMPORAL_NAMESPACE}`);

  return clientInstance;
}

/**
 * Close the Temporal client connection.
 * Call this during graceful shutdown.
 */
export async function closeTemporalClient(): Promise<void> {
  if (connectionInstance) {
    console.log("[Temporal] Closing client connection...");
    await connectionInstance.close();
    connectionInstance = null;
    clientInstance = null;
    console.log("[Temporal] Client connection closed");
  }
}

/**
 * Get Temporal configuration from environment.
 */
export function getTemporalConfig() {
  return {
    address: env.TEMPORAL_ADDRESS,
    namespace: env.TEMPORAL_NAMESPACE,
    taskQueue: env.TEMPORAL_TASK_QUEUE,
  };
}
