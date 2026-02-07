export class ToolError extends Error {
  constructor(
    message: string,
    public readonly code: string = "TOOL_ERROR"
  ) {
    super(message);
    this.name = "ToolError";
  }
}

export function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

export function errorResult(message: string) {
  return {
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    isError: true as const,
  };
}
