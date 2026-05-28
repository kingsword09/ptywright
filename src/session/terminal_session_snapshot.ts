import type { Terminal } from "@xterm/headless";

import { renderAnsiLines, type AnsiRenderedLine } from "../terminal/ansi";
import { applyTextMaskRules } from "../terminal/mask";
import { snapshotLines } from "../terminal/snapshot";
import { fnv1a32 } from "../util/hash";
import type { SnapshotAnsiOptions, SnapshotTextOptions } from "./terminal_session_types";

export function snapshotSessionText(
  terminal: Terminal,
  options?: SnapshotTextOptions,
): {
  text: string;
  hash: string;
} {
  if (options?.maxLines !== undefined && options.tailLines !== undefined) {
    throw new Error("snapshotText: maxLines and tailLines are mutually exclusive");
  }

  let lines = snapshotLines(terminal, {
    scope: options?.scope,
    trimRight: options?.trimRight,
  });

  const trimBottom = options?.trimBottom ?? true;
  if (trimBottom) {
    lines = trimBottomEmptyLines(lines);
  }

  if (options?.maxLines !== undefined) {
    const max = Math.max(0, Math.trunc(options.maxLines));
    lines = lines.slice(0, max);
  }

  if (options?.tailLines !== undefined) {
    const tail = Math.max(0, Math.trunc(options.tailLines));
    lines = lines.slice(Math.max(0, lines.length - tail));
  }

  lines = applyTextMaskRules(lines, options?.mask);

  const text = lines.join("\n");
  return { text, hash: fnv1a32(text) };
}

export function snapshotSessionAnsi(
  terminal: Terminal,
  options?: SnapshotAnsiOptions,
): {
  ansi: string;
  plain: string;
  hash: string;
  lines: AnsiRenderedLine[];
} {
  if (options?.maxLines !== undefined && options.tailLines !== undefined) {
    throw new Error("snapshotAnsi: maxLines and tailLines are mutually exclusive");
  }

  let lines = renderAnsiLines(terminal, {
    scope: options?.scope,
    trimRight: options?.trimRight,
  });

  const trimBottom = options?.trimBottom ?? true;
  if (trimBottom) {
    lines = trimBottomEmptyAnsiLines(lines);
  }

  if (options?.maxLines !== undefined) {
    const max = Math.max(0, Math.trunc(options.maxLines));
    lines = lines.slice(0, max);
  }

  if (options?.tailLines !== undefined) {
    const tail = Math.max(0, Math.trunc(options.tailLines));
    lines = lines.slice(Math.max(0, lines.length - tail));
  }

  if (options?.mask && options.mask.length > 0) {
    const maskedPlain = applyTextMaskRules(
      lines.map((line) => line.plain),
      options.mask,
    );
    const maskedAnsi = applyTextMaskRules(
      lines.map((line) => line.ansi),
      options.mask,
    );

    lines = lines.map((line, idx) => ({
      ...line,
      plain: maskedPlain[idx] ?? "",
      ansi: maskedAnsi[idx] ?? "",
    }));
  }

  const ansi = lines.map((l) => l.ansi).join("\n");
  const plain = lines.map((l) => l.plain).join("\n");
  const hash = fnv1a32(ansi);
  return { ansi, plain, hash, lines };
}

function trimBottomEmptyLines(lines: string[]): string[] {
  let end = lines.length;
  while (end > 0 && lines[end - 1] === "") {
    end -= 1;
  }
  return end === lines.length ? lines : lines.slice(0, end);
}

function trimBottomEmptyAnsiLines(lines: AnsiRenderedLine[]): AnsiRenderedLine[] {
  let end = lines.length;
  while (end > 0) {
    const line = lines[end - 1];
    const isBlank = !line?.hasStyle && (line?.plain ?? "").trim() === "";
    if (!isBlank) break;
    end -= 1;
  }
  return end === lines.length ? lines : lines.slice(0, end);
}
