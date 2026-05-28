import type { Terminal } from "@xterm/headless";

import {
  snapshotPlainLine,
  snapshotStyleRuns,
  type TerminalSnapshotStyleRun,
} from "./snapshot_rows";

export type SnapshotScope = "visible" | "buffer";

export type { TerminalSnapshotStyleRun } from "./snapshot_rows";

export type TerminalSnapshotGrid = {
  cols: number;
  rows: number;
  bufferType: "normal" | "alternate";
  cursorX: number;
  cursorY: number;
  viewportY: number;
  lines: string[];
  styleRuns?: TerminalSnapshotStyleRun[][];
};

function snapshotVisibleLines(terminal: Terminal, trimRight: boolean): string[] {
  const buffer = terminal.buffer.active;
  const nullCell = buffer.getNullCell();

  const startY = buffer.viewportY;
  const lines: string[] = [];

  for (let row = 0; row < terminal.rows; row += 1) {
    const line = buffer.getLine(startY + row);
    lines.push(snapshotPlainLine(line, terminal.cols, nullCell, trimRight));
  }

  return lines;
}

function snapshotVisibleStyleRuns(
  terminal: Terminal,
  trimRight: boolean,
): TerminalSnapshotStyleRun[][] {
  const buffer = terminal.buffer.active;
  const nullCell = buffer.getNullCell();

  const startY = buffer.viewportY;
  const out: TerminalSnapshotStyleRun[][] = [];

  for (let row = 0; row < terminal.rows; row += 1) {
    const line = buffer.getLine(startY + row);
    out.push(snapshotStyleRuns(line, terminal.cols, nullCell, trimRight));
  }

  return out;
}

function snapshotBufferLines(terminal: Terminal, trimRight: boolean): string[] {
  const buffer = terminal.buffer.active;
  const lines: string[] = [];
  for (let y = 0; y < buffer.length; y += 1) {
    const line = buffer.getLine(y);
    lines.push(line ? line.translateToString(trimRight, 0, terminal.cols) : "");
  }
  return lines;
}

export function snapshotLines(
  terminal: Terminal,
  options?: { scope?: SnapshotScope; trimRight?: boolean },
): string[] {
  const trimRight = options?.trimRight ?? true;
  const scope = options?.scope ?? "visible";
  return scope === "buffer"
    ? snapshotBufferLines(terminal, trimRight)
    : snapshotVisibleLines(terminal, trimRight);
}

export function snapshotGrid(
  terminal: Terminal,
  options?: { trimRight?: boolean; includeStyles?: boolean },
): TerminalSnapshotGrid {
  const trimRight = options?.trimRight ?? true;
  const includeStyles = options?.includeStyles ?? false;

  const buffer = terminal.buffer.active;
  const lines = snapshotVisibleLines(terminal, trimRight);

  return {
    cols: terminal.cols,
    rows: terminal.rows,
    bufferType: buffer.type,
    cursorX: buffer.cursorX,
    cursorY: buffer.cursorY,
    viewportY: buffer.viewportY,
    lines,
    styleRuns: includeStyles ? snapshotVisibleStyleRuns(terminal, trimRight) : undefined,
  };
}
