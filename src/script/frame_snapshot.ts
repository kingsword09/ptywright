import { applyTextMaskRules } from "../terminal/mask";
import type { TerminalSnapshotGrid } from "../terminal/snapshot";
import { fnv1a32 } from "../util/hash";
import type { SnapshotTextOptions } from "./frame_session_types";
import { sliceLines, trimBottomEmptyLines } from "./frame_text";

export function snapshotFrameText(
  inputLines: string[],
  options?: SnapshotTextOptions,
): { text: string; hash: string } {
  if (options?.maxLines !== undefined && options.tailLines !== undefined) {
    throw new Error("snapshotText: maxLines and tailLines are mutually exclusive");
  }

  let lines = inputLines;
  if (options?.trimBottom ?? true) {
    lines = trimBottomEmptyLines(lines);
  }

  lines = sliceLines(lines, options);
  lines = applyTextMaskRules(lines, options?.mask);

  const text = lines.join("\n");
  return { text, hash: fnv1a32(text) };
}

export function snapshotFrameAnsiFromText(
  text: string,
  hash: string,
): {
  ansi: string;
  plain: string;
  hash: string;
  lines: Array<{ ansi: string; plain: string }>;
} {
  const lines = text.split("\n").map((line) => ({ ansi: line, plain: line }));
  return { ansi: text, plain: text, hash, lines };
}

export function snapshotFrameGrid(args: {
  lines: string[];
  cols: number;
  rows: number;
  cursorY: number;
  includeStyles?: boolean;
}): { grid: TerminalSnapshotGrid; hash: string } {
  const grid: TerminalSnapshotGrid = {
    cols: args.cols,
    rows: args.rows,
    bufferType: "normal",
    cursorX: 0,
    cursorY: args.cursorY,
    viewportY: 0,
    lines: args.lines,
    styleRuns: args.includeStyles ? args.lines.map(() => []) : undefined,
  };
  return { grid, hash: fnv1a32(JSON.stringify(grid)) };
}
