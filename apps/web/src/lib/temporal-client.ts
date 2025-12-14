import { Client, Connection } from "@temporalio/client";
import type { GitHubIndexWorkflowInput, EvalWorkflowInput } from "@cognobserve/api/schemas";
import { env } from "./env";

// Re-export the types for convenience
export type { GitHubIndexWorkflowInput, EvalWorkflowInput } from "@cognobserve/api/schemas";

let _client: Client | null = null;
let _connection: Connection | null = null;

/**
 * Get or create a Temporal client singleton.
 * Used for starting workflows from the web app.
 */
export async function getTemporalClient(): Promise<Client> {
  if (_client) {
    return _client;
  }

  _connection = await Connection.connect({
    address: env.TEMPORAL_ADDRESS ?? "localhost:7233",
  });

  _client = new Client({
    connection: _connection,
    namespace: "default",
  });

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
    taskQueue: "cognobserve-worker",
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
    taskQueue: "cognobserve-worker",
    workflowId,
    args: [input],
  });

  return handle.workflowId;
}
