// ============================================================
// WORKFLOWS - CENTRALIZED EXPORTS
// ============================================================
// All workflows are exported from here.
// The Temporal worker uses workflowsPath pointing to this file.
//
// IMPORTANT: This file is bundled separately by Temporal for
// workflow isolation. Only import workflow-safe code here.
// ============================================================

// Trace ingestion workflow
export { traceWorkflow } from "./trace.workflow";

// Score ingestion workflow
export { scoreWorkflow } from "./score.workflow";

// Alert evaluation workflow (long-running)
export {
  alertEvaluationWorkflow,
  triggerEvaluationSignal,
  stopEvaluationSignal,
} from "./alert.workflow";

// GitHub index workflow (webhook-triggered)
export { githubIndexWorkflow } from "./github-index.workflow";

// Repository index workflow (UI-triggered full indexing)
export { repositoryIndexWorkflow } from "./repository-index.workflow";

// RCA analysis workflow (manual/automatic)
export { rcaAnalysisWorkflow } from "./rca-analysis.workflow";

// Eval pipeline workflow (PR merge / manual / scheduled)
export { evalPipelineWorkflow } from "./eval.workflow";

// Knowledge base workflows
export { knowledgeIndexWorkflow } from "./knowledge-index.workflow";
export { attachmentExtractWorkflow } from "./attachment-extract.workflow";

// Experiment analysis workflow (A/B testing)
export { experimentAnalysisWorkflow } from "./experiment-analysis.workflow";
