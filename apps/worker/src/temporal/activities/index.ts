// ============================================================
// ACTIVITIES - CENTRALIZED EXPORTS
// ============================================================
// All activities are exported from here for worker registration.
// The worker.ts file imports * from this module.
//
// Activities handle side effects (database, network, etc.)
// Workflows orchestrate activities without side effects.
// ============================================================

// Trace activities
export {
  persistTrace,
  calculateTraceCosts,
  updateCostSummaries,
} from "./trace.activities";

// Score activities
export {
  persistScore,
  validateScoreConfig,
} from "./score.activities";

// Alert activities
export {
  evaluateAlert,
  transitionAlertState,
  dispatchNotification,
} from "./alert.activities";

// GitHub indexing activities (webhook-triggered)
export {
  extractChangedFiles,
  fetchFileContents,
  chunkCodeFiles,
  storeIndexedData,
  shouldIndexFile,
} from "./github.activities";

// Repository indexing activities (UI-triggered full indexing)
export {
  updateRepositoryIndexStatus,
  cleanupRepositoryChunks,
  fetchRepositoryTree,
  fetchRepositoryContents,
  storeRepositoryChunks,
} from "./repository-index.activities";

// Embedding generation activities
export {
  generateEmbeddings,
  storeEmbeddings,
} from "./embedding.activities";

// Vector search activities
export {
  searchCodebase,
  searchProjectCodebase,
} from "./search.activities";

// RCA (Root Cause Analysis) activities
export { analyzeTraces, correlateCodeChanges, generateRCA, storeRCA } from "./rca";

// Eval Pipeline activities
export {
  getEvalSuite,
  createEvalRun,
  runEvalPrompts,
  calculateMetrics,
  detectRegression,
  storeResults,
  triggerAlert,
} from "./eval.activities";
