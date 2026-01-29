/**
 * Options for wrapOpenAI() and wrapAnthropic()
 */
export interface WrapperOptions {
  /**
   * Custom span name prefix
   * @default 'openai' or 'anthropic'
   */
  tracePrefix?: string;

  /**
   * Whether to capture input messages
   * @default true
   */
  captureInput?: boolean;

  /**
   * Whether to capture output content
   * @default true
   */
  captureOutput?: boolean;

  /**
   * Whether to create a new trace for each call if none is active
   * If false, calls without an active trace are not traced
   * @default false
   */
  createTrace?: boolean;
}

/**
 * Internal: Resolved options with defaults applied
 */
export interface ResolvedWrapperOptions {
  tracePrefix: string;
  captureInput: boolean;
  captureOutput: boolean;
  createTrace: boolean;
}

/**
 * Apply default options
 */
export function resolveOptions(
  options: WrapperOptions,
  defaultPrefix: string
): ResolvedWrapperOptions {
  return {
    tracePrefix: options.tracePrefix ?? defaultPrefix,
    captureInput: options.captureInput ?? true,
    captureOutput: options.captureOutput ?? true,
    createTrace: options.createTrace ?? false,
  };
}
