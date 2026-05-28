import type { Terminal } from "@xterm/headless";

import { escapeHtml } from "../common/html";
import type { SnapshotScope } from "../terminal/snapshot";
import type { TerminalMeta } from "../terminal/view";
import { renderVisibleRowHtml } from "./report_snapshot_styles";

export type ParsedSnapshotViewText = {
  headerLine: string | null;
  rows: Array<{ prefix?: string; text: string }>;
};

export function parseSnapshotViewText(viewText: string): ParsedSnapshotViewText {
  const normalized = stripAnsi(viewText).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  const first = lines[0] ?? "";

  const hasHeader = /\bsession=/.test(first) && /\bhash=/.test(first);
  const headerLine = hasHeader ? first : null;
  const rowLines = hasHeader ? lines.slice(1) : lines;

  const rows = rowLines.map((line) => {
    const match = line.match(/^(\d+│\s)(.*)$/);
    if (!match) return { text: line };
    return { prefix: match[1], text: match[2] ?? "" };
  });

  return { headerLine, rows };
}

export function renderSnapshotViewTextHtml(options: {
  headerLine: string;
  rows: Array<{ prefix?: string; text: string }>;
  changedLines: Set<number>;
}): string {
  const digits = Math.max(2, String(options.rows.length).length);
  const out: string[] = [`<span class="headerblock">${escapeHtml(options.headerLine)}</span>`];

  for (let i = 0; i < options.rows.length; i += 1) {
    const row = options.rows[i];
    const prefix = row?.prefix ?? `${String(i + 1).padStart(digits, "0")}│ `;
    const prefixHtml = `<span class="ln">${escapeHtml(prefix)}</span>`;
    const rowClass = options.changedLines.has(i) ? "row changed" : "row";
    out.push(`<span class="${rowClass}">${prefixHtml}${escapeHtml(row?.text ?? "")}</span>`);
  }

  return out.join("");
}

export function renderSnapshotViewHtml(options: {
  terminal: Terminal;
  sessionId: string;
  scope: SnapshotScope;
  hash: string;
  lines: string[];
  meta: TerminalMeta;
  lineNumbers: boolean;
  changedLines: Set<number>;
  trimRight: boolean;
}): string {
  const headerLine = formatHeaderLine({
    sessionId: options.sessionId,
    scope: options.scope,
    hash: options.hash,
    meta: options.meta,
    changedCount: options.changedLines.size,
  });

  const digits = Math.max(2, String(options.lines.length).length);
  const out: string[] = [`<span class="headerblock">${escapeHtml(headerLine)}</span>`];

  if (options.scope === "visible") {
    for (let i = 0; i < options.lines.length; i += 1) {
      const n = i + 1;
      const prefix = options.lineNumbers ? `${String(n).padStart(digits, "0")}│ ` : "";
      const prefixHtml = options.lineNumbers ? `<span class="ln">${escapeHtml(prefix)}</span>` : "";

      const contentHtml = renderVisibleRowHtml(options.terminal, i, options.trimRight);
      const rowClass = options.changedLines.has(i) ? "row changed" : "row";
      out.push(`<span class="${rowClass}">${prefixHtml}${contentHtml}</span>`);
    }

    return out.join("");
  }

  // buffer scope: currently renders plain text only
  for (let i = 0; i < options.lines.length; i += 1) {
    const n = i + 1;
    const prefix = options.lineNumbers ? `${String(n).padStart(digits, "0")}│ ` : "";
    const prefixHtml = options.lineNumbers ? `<span class="ln">${escapeHtml(prefix)}</span>` : "";
    out.push(`<span class="row">${prefixHtml}${escapeHtml(options.lines[i] ?? "")}</span>`);
  }

  return out.join("");
}

export function diffLineIndices(previous: string[], next: string[]): Set<number> {
  const out = new Set<number>();
  const max = Math.max(previous.length, next.length);

  for (let i = 0; i < max; i += 1) {
    const a = previous[i] ?? "";
    const b = next[i] ?? "";
    if (a !== b) out.add(i);
  }

  return out;
}

export function getTerminalMeta(terminal: Terminal): TerminalMeta {
  const buffer = terminal.buffer.active;
  return {
    cols: terminal.cols,
    rows: terminal.rows,
    bufferType: buffer.type,
    viewportY: buffer.viewportY,
    baseY: buffer.baseY,
    length: buffer.length,
    cursorX: buffer.cursorX,
    cursorY: buffer.cursorY,
  };
}

function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
}

function formatHeaderLine(input: {
  sessionId: string;
  scope: SnapshotScope;
  hash: string;
  meta: TerminalMeta;
  changedCount: number;
}): string {
  const cursorAbsY = input.meta.baseY + input.meta.cursorY;
  const cursorViewportRow = cursorAbsY - input.meta.viewportY;
  const cursorViewportCol = input.meta.cursorX;

  return [
    `session=${input.sessionId}`,
    `scope=${input.scope}`,
    `size=${input.meta.cols}x${input.meta.rows}`,
    `buffer=${input.meta.bufferType}`,
    `cursor=${cursorViewportCol + 1},${cursorViewportRow + 1}`,
    `hash=${input.hash}`,
    `changed=${input.changedCount}`,
  ].join(" ");
}
