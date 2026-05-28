import type { ExtractedStep } from "./step_extractor_types";

export function extractFromTextStep(text: string): ExtractedStep | null {
  const normalized = text.toLowerCase();

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
