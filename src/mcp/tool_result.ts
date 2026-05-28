export type ToolErrorResult = {
  isError: true;
  content: { type: "text"; text: string }[];
  structuredContent: Record<string, unknown> & { error: string };
};

export function toolError(message: string, extra: Record<string, unknown> = {}): ToolErrorResult {
  return {
    isError: true,
    content: [{ type: "text", text: message }],
    structuredContent: { error: message, ...extra },
  };
}
