import type { Terminal } from "@xterm/headless";

import type { CellStyle } from "./style";
import { extractStyle, findMeaningfulEndCol, isDefaultStyle, styleKey } from "./style";

export type TerminalSnapshotStyleRun = {
  startCol: number;
  endCol: number;
  style: CellStyle;
};

export function snapshotPlainLine(
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

export function snapshotStyleRuns(
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
