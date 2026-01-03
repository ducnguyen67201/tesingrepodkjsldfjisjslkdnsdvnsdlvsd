import { Client, Connection } from "@temporalio/client";
import type { GitHubIndexWorkflowInput, EvalWorkflowInput } from "@ducsigr/api/schemas";
import { env } from "./env";

// Re-export the types for convenience
export type { GitHubIndexWorkflowInput, EvalWorkflowInput } from "@ducsigr/api/schemas";

let _client: Client | null = null;
let _connection: Connection | null = null;

/**
 * Check if connecting to Temporal Cloud
 */
function isTemporalCloud(): boolean {
  const address = env.TEMPORAL_ADDRESS ?? "";
  return address.includes("tmprl.cloud") || address.includes("temporal.io");
}

/**
 * Get TLS config for Temporal Cloud (API Key auth needs TLS enabled)
 */
function getTlsConfig() {
  if (env.TEMPORAL_API_KEY && isTemporalCloud()) {
    return true; // Enable TLS without client certs
  }
  return undefined;
}

/**
 * Get or create a Temporal client singleton.
 * Used for starting workflows from the web app.
 */
export async function getTemporalClient(): Promise<Client> {
  if (_client) {
    return _client;
  }

  const address = env.TEMPORAL_ADDRESS ?? "localhost:7233";
  console.log(`[Temporal Client] Connecting to ${address}...`);

  _connection = await Connection.connect({
    address,
    tls: getTlsConfig(),
    apiKey: env.TEMPORAL_API_KEY,
  });

  _client = new Client({
    connection: _connection,
    namespace: env.TEMPORAL_NAMESPACE,
  });

  console.log(`[Temporal Client] Connected to namespace: ${env.TEMPORAL_NAMESPACE}`);

  return _client;
}

/**
 * Start the GitHub indexing workflow.
 * Returns the workflow ID for tracking.
 */
export async function startGitHubIndexWorkflow(
  input: GitHubIndexWorkflowInput
): Promise<string> {
  const client = await getTemporalClient();

  const handle = await client.workflow.start("githubIndexWorkflow", {
    taskQueue: "ducsigr-tasks",
    workflowId: `github-index-${input.deliveryId}`,
    args: [input],
  });

  return handle.workflowId;
}

/**
 * Start the eval pipeline workflow.
 * Returns the workflow ID for tracking.
 *
 * Triggered by:
 * - PR merge (via GitHub webhook)
 * - Manual trigger (via API)
 * - Scheduled runs (future)
 */
export async function startEvalWorkflow(
  input: EvalWorkflowInput
): Promise<string> {
  const client = await getTemporalClient();

  // Generate unique workflow ID
  const timestamp = Date.now();
  const triggerSuffix = input.triggerRef
    ? input.triggerRef.replace(/[^a-zA-Z0-9-]/g, "-")
    : timestamp.toString();
  const workflowId = `eval-${input.suiteId}-${triggerSuffix}`;

  const handle = await client.workflow.start("evalPipelineWorkflow", {
    taskQueue: "ducsigr-tasks",
    workflowId,
    args: [input],
  });

  return handle.workflowId;
}
