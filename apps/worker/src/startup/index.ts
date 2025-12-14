/**
 * Workflow Startup Module
 *
 * Centralizes all workflow initialization on worker startup.
 * Provides a unified pipeline for starting and monitoring workflows.
 *
 * Architecture:
 * - WORKFLOW_REGISTRY defines all workflow types and their starters
 * - startAllWorkflows() runs all starters through a unified pipeline
 * - Single consolidated log output for success/failure summary
 */

import { type Client } from "@temporalio/client";
import { getTemporalClient, getTemporalConfig } from "@/temporal";
import { startAlertWorkflows } from "./alert-workflows";

// ============================================
// Types
// ============================================

/** Result from a single workflow starter */
export interface WorkflowStarterResult {
  started: number;
  skipped: number;
  errors: string[];
}

/** Aggregated results from all workflow starters */
export interface StartupResult {
  success: boolean;
  totalStarted: number;
  totalSkipped: number;
  totalErrors: number;
  workflows: Record<WorkflowType, WorkflowStarterResult>;
}

/** Workflow starter function signature */
type WorkflowStarter = (
  client: Client,
  taskQueue: string
) => Promise<{ started: number; skipped: number }>;

/** Supported workflow types */
type WorkflowType = "alerts" | "github" | "traces" | "scores" | "evals";

/** Workflow configuration */
interface WorkflowConfig {
  name: string;
  description: string;
  startOnBoot: boolean;
  starter?: WorkflowStarter;
}

// ============================================
// Workflow Registry
// ============================================

/**
 * Registry of all workflow types in the system.
 *
 * - startOnBoot: true = Started when worker boots (long-running)
 * - startOnBoot: false = Event-driven (started by external triggers)
 */
const WORKFLOW_REGISTRY: Record<WorkflowType, WorkflowConfig> = {
  alerts: {
    name: "Alert Evaluation",
    description: "Long-running workflows for monitoring alert conditions",
    startOnBoot: true,
    starter: startAlertWorkflows,
  },
  github: {
    name: "GitHub Indexing",
    description: "Event-driven workflows triggered by GitHub webhooks",
    startOnBoot: false,
    // No starter - triggered by POST /api/webhooks/github
  },
  traces: {
    name: "Trace Ingestion",
    description: "Event-driven workflows for processing incoming traces",
    startOnBoot: false,
    // No starter - triggered by ingest service
  },
  scores: {
    name: "Score Ingestion",
    description: "Event-driven workflows for processing incoming scores",
    startOnBoot: false,
    // No starter - triggered by ingest service
  },
  evals: {
    name: "Eval Pipeline",
    description: "Event-driven workflows for regression detection on PR merge",
    startOnBoot: false,
    // No starter - triggered by GitHub webhook (PR merge) or manual API
  },
};

// ============================================
// Startup Pipeline
// ============================================

/**
 * Initialize all boot-time workflows through a unified pipeline.
 *
 * Pipeline steps:
 * 1. Connect to Temporal
 * 2. Run all starters marked with startOnBoot: true
 * 3. Collect results and errors
 * 4. Print consolidated summary
 *
 * @returns Aggregated results from all workflow starters
 */
export async function startAllWorkflows(): Promise<StartupResult> {
  const startTime = Date.now();

  // Initialize results
  const results: StartupResult = {
    success: true,
    totalStarted: 0,
    totalSkipped: 0,
    totalErrors: 0,
    workflows: {
      alerts: { started: 0, skipped: 0, errors: [] },
      github: { started: 0, skipped: 0, errors: [] },
      traces: { started: 0, skipped: 0, errors: [] },
      scores: { started: 0, skipped: 0, errors: [] },
      evals: { started: 0, skipped: 0, errors: [] },
    },
  };

  // Get Temporal client and config
  const client = await getTemporalClient();
  const config = getTemporalConfig();

  // Run all boot-time starters
  const bootWorkflows = Object.entries(WORKFLOW_REGISTRY).filter(
    ([, cfg]) => cfg.startOnBoot && cfg.starter
  ) as [WorkflowType, WorkflowConfig & { starter: WorkflowStarter }][];

  for (const [type, cfg] of bootWorkflows) {
    try {
      const result = await cfg.starter(client, config.taskQueue);
      results.workflows[type] = {
        started: result.started,
        skipped: result.skipped,
        errors: [],
      };
      results.totalStarted += result.started;
      results.totalSkipped += result.skipped;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      results.workflows[type] = {
        started: 0,
        skipped: 0,
        errors: [errorMsg],
      };
      results.totalErrors += 1;
      results.success = false;
    }
  }

  // Print consolidated summary
  printStartupSummary(results, Date.now() - startTime);

  return results;
}

// ============================================
// Logging
// ============================================

/**
 * Print a consolidated startup summary.
 * Single log output with all workflow status information.
 */
function printStartupSummary(results: StartupResult, durationMs: number): void {
  const lines: string[] = [
    "",
    "┌────────────────────────────────────────────────────────┐",
    "│              WORKFLOW STARTUP SUMMARY                  │",
    "├────────────────────────────────────────────────────────┤",
  ];

  // Workflow details
  for (const [type, config] of Object.entries(WORKFLOW_REGISTRY)) {
    const result = results.workflows[type as WorkflowType];
    const status = config.startOnBoot
      ? result.errors.length > 0
        ? "❌ FAILED"
        : `✓ ${result.started} started, ${result.skipped} skipped`
      : "○ Event-driven";

    const paddedName = config.name.padEnd(20);
    lines.push(`│  ${paddedName} ${status.padEnd(33)}│`);
  }

  // Summary
  lines.push("├────────────────────────────────────────────────────────┤");
  lines.push(
    `│  Total: ${results.totalStarted} started, ${results.totalSkipped} skipped, ${results.totalErrors} errors`.padEnd(
      57
    ) + "│"
  );
  lines.push(`│  Duration: ${durationMs}ms`.padEnd(57) + "│");
  lines.push(
    `│  Status: ${results.success ? "✓ SUCCESS" : "❌ FAILED"}`.padEnd(57) + "│"
  );
  lines.push("└────────────────────────────────────────────────────────┘");

  // Print errors if any
  if (results.totalErrors > 0) {
    lines.push("");
    lines.push("ERRORS:");
    for (const [type, result] of Object.entries(results.workflows)) {
      for (const error of result.errors) {
        lines.push(`  [${type}] ${error}`);
      }
    }
  }

  console.log(lines.join("\n"));
}

// ============================================
// Exports
// ============================================

export { startAlertWorkflows } from "./alert-workflows";
export { WORKFLOW_REGISTRY };
export type { WorkflowType, WorkflowConfig };
