import type { Terminal } from "@xterm/headless";

import type { CellStyle } from "./style";
import { extractStyle, findMeaningfulEndCol, isDefaultStyle, styleKey } from "./style";

export type SnapshotScope = "visible" | "buffer";

export type TerminalSnapshotStyleRun = {
  startCol: number;
  endCol: number;
  style: CellStyle;
};

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

function snapshotPlainLine(
  line: ReturnType<Terminal["buffer"]["active"]["getLine"]>,
  cols: number,
  nullCell: ReturnType<Terminal["buffer"]["active"]["getNullCell"]>,
  trimRight: boolean,
): string {
  let endCol = cols;
  if (trimRight) {
    endCol = findMeaningfulEndCol(line, cols, nullCell);
  }

  let out = "";
  for (let x = 0; x < endCol; x += 1) {
    const cell = line?.getCell(x, nullCell);
    if (!cell) {
      out += " ";
      continue;
    }

    const width = cell.getWidth();
    if (width === 0) {
      continue;
    }

    out += cell.getChars() || " ";
  }

  return out;
}

function snapshotStyleRuns(
  line: ReturnType<Terminal["buffer"]["active"]["getLine"]>,
  cols: number,
  nullCell: ReturnType<Terminal["buffer"]["active"]["getNullCell"]>,
  trimRight: boolean,
): TerminalSnapshotStyleRun[] {
  let endCol = cols;
  if (trimRight) {
    endCol = findMeaningfulEndCol(line, cols, nullCell);
  }

  const out: TerminalSnapshotStyleRun[] = [];

  let currentKey: string | null = null;
  let currentRun: { startCol: number; endCol: number; style: CellStyle } | null = null;

  for (let x = 0; x < endCol; x += 1) {
    const cell = line?.getCell(x, nullCell);
    if (!cell) {
      if (currentRun) {
        out.push(currentRun);
        currentRun = null;
        currentKey = null;
      }
      continue;
    }

    const width = cell.getWidth();
    if (width === 0) {
      continue;
    }

    const style = extractStyle(cell);
    if (isDefaultStyle(style)) {
      if (currentRun) {
        out.push(currentRun);
        currentRun = null;
        currentKey = null;
      }
      continue;
    }

    const key = styleKey(style);
    if (currentRun && key === currentKey) {
      currentRun.endCol = x + width;
      continue;
    }

    if (currentRun) {
      out.push(currentRun);
    }

    currentKey = key;
    currentRun = {
      startCol: x,
      endCol: x + width,
      style,
    };
  }

  if (currentRun) {
    out.push(currentRun);
  }

  return out;
}
