import type { SnapshotScope } from "./snapshot";

export type TerminalMeta = {
  cols: number;
  rows: number;
  bufferType: "normal" | "alternate";
  viewportY: number;
  baseY: number;
  length: number;
  cursorX: number;
  cursorY: number;
};

export type SnapshotViewOptions = {
  sessionId: string;
  scope: SnapshotScope;
  hash: string;
  lines: string[];
  meta: TerminalMeta;
  lineNumbers?: boolean;
};

export function formatSnapshotView(options: SnapshotViewOptions): string {
  const lineNumbers = options.lineNumbers ?? true;

  const cursorAbsY = options.meta.baseY + options.meta.cursorY;
  const cursorViewportRow = cursorAbsY - options.meta.viewportY;
  const cursorViewportCol = options.meta.cursorX;

  const header = [
    `session=${options.sessionId}`,
    `scope=${options.scope}`,
    `size=${options.meta.cols}x${options.meta.rows}`,
    `buffer=${options.meta.bufferType}`,
    `cursor=${cursorViewportCol + 1},${cursorViewportRow + 1}`,
    `hash=${options.hash}`,
  ].join(" ");

  const digits = Math.max(2, String(options.lines.length).length);
  const out: string[] = [header];

  for (let i = 0; i < options.lines.length; i += 1) {
    const n = i + 1;
    const prefix = lineNumbers ? `${String(n).padStart(digits, "0")}│ ` : "";
    out.push(`${prefix}${options.lines[i] ?? ""}`);
  }

  return out.join("\n");
}
