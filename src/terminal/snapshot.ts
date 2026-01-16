import type { Terminal } from "@xterm/headless";

export type SnapshotScope = "visible" | "buffer";

export type TerminalSnapshotGrid = {
  cols: number;
  rows: number;
  bufferType: "normal" | "alternate";
  cursorX: number;
  cursorY: number;
  viewportY: number;
  lines: string[];
};

function snapshotVisibleLines(terminal: Terminal, trimRight: boolean): string[] {
  const buffer = terminal.buffer.active;
  const startY = buffer.viewportY;
  const lines: string[] = [];

  for (let row = 0; row < terminal.rows; row += 1) {
    const line = buffer.getLine(startY + row);
    lines.push(line ? line.translateToString(trimRight, 0, terminal.cols) : "");
  }

  return lines;
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
  options?: { trimRight?: boolean },
): TerminalSnapshotGrid {
  const buffer = terminal.buffer.active;
  return {
    cols: terminal.cols,
    rows: terminal.rows,
    bufferType: buffer.type,
    cursorX: buffer.cursorX,
    cursorY: buffer.cursorY,
    viewportY: buffer.viewportY,
    lines: snapshotVisibleLines(terminal, options?.trimRight ?? true),
  };
}
