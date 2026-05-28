import type { CodeBlock } from "./doc_parser";
import type { ExtractedLaunch, ExtractedStep } from "./step_extractor_types";

export function isShellLanguage(lang: string): boolean {
  const shellLangs = [
    "bash",
    "sh",
    "shell",
    "zsh",
    "fish",
    "console",
    "terminal",
    "cmd",
    "powershell",
  ];
  return shellLangs.includes(lang.toLowerCase());
}

export function extractFromShellBlock(block: CodeBlock): {
  launch?: ExtractedLaunch;
  steps: ExtractedStep[];
} {
  const lines = block.code.split("\n").filter((l) => l.trim());
  const steps: ExtractedStep[] = [];
  let launch: ExtractedLaunch | undefined;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("#") || trimmed.startsWith("//")) {
      continue;
    }

    const command = trimmed
      .replace(/^\$\s+/, "")
      .replace(/^>\s+/, "")
      .replace(/^%\s+/, "");

    if (!command) continue;

    if (!launch && isLaunchCandidate(command)) {
      launch = parseLaunchCommand(command);
      continue;
    }

    const step = parseCommandAsStep(command);
    if (step) {
      steps.push(step);
    }
  }

  return { launch, steps };
}

export function extractFromGenericCodeBlock(block: CodeBlock): ExtractedStep[] {
  const steps: ExtractedStep[] = [];
  const lines = block.code.split("\n").filter((l) => l.trim());

  for (const line of lines) {
    if (/^[a-z_][a-z0-9_-]*(\s|$)/i.test(line.trim())) {
      steps.push({
        type: "sendText",
        params: { text: line.trim(), enter: true },
        source: "code_block",
        confidence: "low",
        rawText: line,
      });
    }
  }

  return steps;
}

function isLaunchCandidate(command: string): boolean {
  const launchPatterns = [
    /^(node|bun|deno|python|python3|ruby|perl)\s+/i,
    /^(npm|yarn|pnpm|bun)\s+(run|start|test)/i,
    /^(cargo|go|rust)\s+run/i,
    /^\.\//,
    /^[a-z_][a-z0-9_-]*$/i,
  ];

  return launchPatterns.some((p) => p.test(command));
}

function parseLaunchCommand(command: string): ExtractedLaunch {
  const parts = parseCommandLine(command);
  const [cmd, ...args] = parts;

  return {
    command: cmd ?? command,
    args: args.length > 0 ? args : undefined,
    confidence: "high",
  };
}

function parseCommandLine(command: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inQuote: string | null = null;
  let escape = false;

  for (const char of command) {
    if (escape) {
      current += char;
      escape = false;
      continue;
    }

    if (char === "\\") {
      escape = true;
      continue;
    }

    if ((char === '"' || char === "'") && !inQuote) {
      inQuote = char;
      continue;
    }

    if (char === inQuote) {
      inQuote = null;
      continue;
    }

    if (char === " " && !inQuote) {
      if (current) {
        parts.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current) {
    parts.push(current);
  }

  return parts;
}

function parseCommandAsStep(command: string): ExtractedStep | null {
  if (/^(error|warning|info|debug|note):/i.test(command)) {
    return null;
  }

  return {
    type: "sendText",
    params: { text: command, enter: true },
    source: "code_block",
    confidence: "high",
    rawText: command,
  };
}
