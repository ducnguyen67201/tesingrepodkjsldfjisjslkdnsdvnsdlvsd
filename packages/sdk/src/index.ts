// Main client
export { CognObserve } from './cognobserve';

// Classes (for advanced usage)
export { Trace } from './trace';
export { Span } from './span';
export { PromptClient } from './prompts';
export { LoggerClient } from './logger';

// Types
export type {
  CognObserveConfig,
  TraceOptions,
  SpanOptions,
  SpanEndOptions,
  SpanLevel,
  TokenUsage,
  UserInfo,
} from './types';

// Log types
export type { LogLevel, LogRecord } from './log-types';

// Observe types
export type { ObserveOptions } from './observe';

// Prompt types
export type {
  Prompt,
  PromptResponse,
  PromptTemplate,
  PromptType,
  PromptLabelName,
  PromptVariable,
  PromptConfig,
  ChatMessage,
  TextContent,
  ChatContent,
  CompiledPrompt,
  CompiledTextPrompt,
  CompiledChatPrompt,
  GetPromptOptions,
  // Experiment types
  VariantName,
  ExperimentStatus,
  GetExperimentOptions,
  ExperimentInfo,
  VariantInfo,
  ExperimentTraceMetadata,
  ExperimentAssignment,
} from './prompts';

// Prompt utilities
export { compilePrompt, extractVariables } from './prompts';

// Context utilities
export { getActiveTrace, getActiveSpan, runWithContext } from './context';
