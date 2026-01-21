import type { CodeBlock, ParsedDocument } from "./doc_parser";
import type { ScriptStep } from "../script/schema";

export type ExtractedStep = {
  type: ScriptStep["type"];
  params: Record<string, unknown>;
  source: "code_block" | "text_step" | "inferred";
  confidence: "high" | "medium" | "low";
  rawText?: string;
};

export type ExtractedLaunch = {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  confidence: "high" | "medium" | "low";
};

export type ExtractionResult = {
  launch?: ExtractedLaunch;
  steps: ExtractedStep[];
  warnings: string[];
};

export function extractSteps(doc: ParsedDocument): ExtractionResult {
  const warnings: string[] = [];
  const steps: ExtractedStep[] = [];
  let launch: ExtractedLaunch | undefined;

  // Priority 1: Extract from shell/bash code blocks
  for (const block of doc.codeBlocks) {
    if (isShellLanguage(block.language)) {
      const extracted = extractFromShellBlock(block);
      if (!launch && extracted.launch) {
        launch = extracted.launch;
      }
      steps.push(...extracted.steps);
    }
  }

  // Priority 2: Extract from text steps if no code blocks found
  if (steps.length === 0 && doc.steps.length > 0) {
    for (const textStep of doc.steps) {
      const extracted = extractFromTextStep(textStep);
      if (extracted) {
        steps.push(extracted);
      }
    }
  }

  // Priority 3: Try to extract from any code blocks
  if (steps.length === 0) {
    for (const block of doc.codeBlocks) {
      if (!isShellLanguage(block.language)) {
        const extracted = extractFromGenericCodeBlock(block);
        steps.push(...extracted);
      }
    }
  }

  // Add default waits between input steps
  const stepsWithWaits = insertDefaultWaits(steps);

  // Validate and add warnings
  if (!launch && stepsWithWaits.length > 0) {
    warnings.push("No launch command detected. You may need to specify targetCommand.");
  }

  if (stepsWithWaits.length === 0) {
    warnings.push("No test steps could be extracted from the document.");
  }

  return {
    launch,
    steps: stepsWithWaits,
    warnings,
  };
}

function isShellLanguage(lang: string): boolean {
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

function extractFromShellBlock(block: CodeBlock): {
  launch?: ExtractedLaunch;
  steps: ExtractedStep[];
} {
  const lines = block.code.split("\n").filter((l) => l.trim());
  const steps: ExtractedStep[] = [];
  let launch: ExtractedLaunch | undefined;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip comments
    if (trimmed.startsWith("#") || trimmed.startsWith("//")) {
      continue;
    }

    // Remove shell prompt prefixes
    const command = trimmed
      .replace(/^\$\s+/, "")
      .replace(/^>\s+/, "")
      .replace(/^%\s+/, "");

    if (!command) continue;

    // Check if this is a launch command (first meaningful command)
    if (!launch && isLaunchCandidate(command)) {
      launch = parseLaunchCommand(command);
      continue;
    }

    // Parse as input step
    const step = parseCommandAsStep(command);
    if (step) {
      steps.push(step);
    }
  }

  return { launch, steps };
}

function extractFromTextStep(text: string): ExtractedStep | null {
  const normalized = text.toLowerCase();

  // Pattern: "type X" or "enter X"
  const typeMatch = text.match(/^(?:type|enter|input)\s+["`']?(.+?)["`']?$/i);
  if (typeMatch && typeMatch[1]) {
    return {
      type: "sendText",
      params: { text: typeMatch[1], enter: true },
      source: "text_step",
      confidence: "medium",
      rawText: text,
    };
  }

  // Pattern: "press X"
  const pressMatch = text.match(/^press\s+(.+)$/i);
  if (pressMatch && pressMatch[1]) {
    return {
      type: "pressKey",
      params: { key: normalizeKeyName(pressMatch[1]) },
      source: "text_step",
      confidence: "medium",
      rawText: text,
    };
  }

  // Pattern: "wait for X"
  const waitMatch = text.match(/^wait\s+(?:for\s+)?["`']?(.+?)["`']?$/i);
  if (waitMatch && waitMatch[1]) {
    return {
      type: "waitForText",
      params: { text: waitMatch[1], timeoutMs: 10000 },
      source: "text_step",
      confidence: "medium",
      rawText: text,
    };
  }

  // Pattern: "check/verify/assert X"
  const assertMatch = text.match(
    /^(?:check|verify|assert|expect)\s+(?:that\s+)?["`']?(.+?)["`']?$/i,
  );
  if (assertMatch && assertMatch[1]) {
    return {
      type: "assert",
      params: { text: assertMatch[1], description: text },
      source: "text_step",
      confidence: "medium",
      rawText: text,
    };
  }

  // Pattern: "run X" or "execute X"
  const runMatch = text.match(/^(?:run|execute)\s+(.+)$/i);
  if (runMatch && runMatch[1]) {
    return {
      type: "sendText",
      params: { text: runMatch[1], enter: true },
      source: "text_step",
      confidence: "low",
      rawText: text,
    };
  }

  // Chinese patterns
  if (/^输入\s+/.test(text)) {
    const input = text.replace(/^输入\s+/, "").trim();
    return {
      type: "sendText",
      params: { text: input, enter: true },
      source: "text_step",
      confidence: "medium",
      rawText: text,
    };
  }

  if (/^等待\s+/.test(text)) {
    const target = text.replace(/^等待\s+/, "").trim();
    return {
      type: "waitForText",
      params: { text: target, timeoutMs: 10000 },
      source: "text_step",
      confidence: "medium",
      rawText: text,
    };
  }

  // Fallback: treat as sendText if it looks like a command
  if (/^[a-z_][a-z0-9_-]*\s/i.test(normalized) || text.startsWith("./")) {
    return {
      type: "sendText",
      params: { text: text.trim(), enter: true },
      source: "text_step",
      confidence: "low",
      rawText: text,
    };
  }

  return null;
}

function extractFromGenericCodeBlock(block: CodeBlock): ExtractedStep[] {
  const steps: ExtractedStep[] = [];
  const lines = block.code.split("\n").filter((l) => l.trim());

  for (const line of lines) {
    // Only extract if it looks like a command
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
    /^[a-z_][a-z0-9_-]*$/i, // Single command name
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
  // Skip if it looks like output, not input
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

function normalizeKeyName(key: string): string {
  const keyMap: Record<string, string> = {
    enter: "Enter",
    return: "Enter",
    tab: "Tab",
    escape: "Escape",
    esc: "Escape",
    space: "Space",
    backspace: "Backspace",
    delete: "Delete",
    up: "ArrowUp",
    down: "ArrowDown",
    left: "ArrowLeft",
    right: "ArrowRight",
    home: "Home",
    end: "End",
    pageup: "PageUp",
    pagedown: "PageDown",
    "ctrl+c": "Ctrl+C",
    "ctrl+d": "Ctrl+D",
    "ctrl+z": "Ctrl+Z",
  };

  const normalized = key.toLowerCase().trim();
  return keyMap[normalized] ?? key;
}

function insertDefaultWaits(steps: ExtractedStep[]): ExtractedStep[] {
  const result: ExtractedStep[] = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (!step) continue;

    result.push(step);

    // Add waitForStableScreen after input steps (unless next step is already a wait)
    const nextStep = steps[i + 1];
    const isInputStep = step.type === "sendText" || step.type === "pressKey";
    const nextIsWait =
      nextStep?.type === "waitForText" ||
      nextStep?.type === "waitForStableScreen" ||
      nextStep?.type === "sleep";

    if (isInputStep && !nextIsWait && i < steps.length - 1) {
      result.push({
        type: "waitForStableScreen",
        params: { timeoutMs: 5000, quietMs: 300 },
        source: "inferred",
        confidence: "low",
      });
    }
  }

  return result;
}
