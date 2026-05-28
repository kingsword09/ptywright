import type { CodeBlock, ParsedDocument } from "./doc_parser_types";

export function parseJson(content: string): ParsedDocument {
  const parsed = JSON.parse(content) as unknown;
  const codeBlocks: CodeBlock[] = [];
  const steps: string[] = [];

  if (typeof parsed === "object" && parsed !== null) {
    const obj = parsed as Record<string, unknown>;

    if ("launch" in obj && "steps" in obj) {
      return {
        title: (obj.name as string) ?? "Imported Script",
        description: "Parsed from JSON script",
        codeBlocks: [],
        steps: [],
        rawContent: content,
        format: "json",
      };
    }

    if (Array.isArray(obj.commands)) {
      for (const cmd of obj.commands) {
        if (typeof cmd === "string") steps.push(cmd);
        else if (typeof cmd === "object" && cmd && "command" in cmd) {
          steps.push(String((cmd as Record<string, unknown>).command));
        }
      }
    }

    if (Array.isArray(obj.steps)) {
      for (const step of obj.steps) {
        if (typeof step === "string") steps.push(step);
        else if (typeof step === "object" && step) {
          const s = step as Record<string, unknown>;
          if (typeof s.description === "string") steps.push(s.description);
          else if (typeof s.command === "string") steps.push(s.command);
        }
      }
    }
  }

  return {
    codeBlocks,
    steps,
    rawContent: content,
    format: "json",
  };
}

export function parseYaml(content: string): ParsedDocument {
  const steps: string[] = [];
  const lines = content.split("\n");

  for (const line of lines) {
    const match = line.match(/^\s*-\s+(.+)$/);
    if (match && match[1]) {
      const value = match[1].trim();
      if (!value.startsWith("{") && !value.includes(":")) {
        steps.push(value);
      }
    }
  }

  return {
    codeBlocks: [],
    steps,
    rawContent: content,
    format: "yaml",
  };
}
