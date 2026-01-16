import { Terminal } from "@xterm/headless";

import { writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";

import type { Color, CellStyle } from "../terminal/style";
import { extractStyle, findMeaningfulEndCol, isDefaultStyle, styleKey } from "../terminal/style";
import { snapshotGrid, snapshotLines } from "../terminal/snapshot";
import type { SnapshotScope } from "../terminal/snapshot";
import type { TerminalMeta } from "../terminal/view";
import { fnv1a32 } from "../util/hash";

import type { AsciicastEvent } from "./asciicast";

type ParsedAsciicast = {
  header: Record<string, unknown>;
  events: AsciicastEvent[];
};

type ReportFrame = {
  atSeconds: number;
  label: string;
  viewHtml: string;
};

export async function generateTraceReportHtml(
  cast: string,
  options?: {
    scope?: SnapshotScope;
    maxFrames?: number;
  },
): Promise<string> {
  const parsed = parseAsciicast(cast);
  const termInfo = getTermInfo(parsed.header);

  const terminal = new Terminal({
    cols: termInfo.cols,
    rows: termInfo.rows,
    allowProposedApi: true,
    scrollback: 2000,
    convertEol: true,
  });

  const scope = options?.scope ?? "visible";
  const maxFrames = options?.maxFrames ?? 200;

  let writeChain: Promise<void> = Promise.resolve();

  const frames: ReportFrame[] = [];
  let previousRowSignatures: string[] | null = null;

  const capture = (atSeconds: number, label: string) => {
    if (frames.length >= maxFrames) return;

    let lines: string[];
    let hash: string;
    let changedLines = new Set<number>();

    if (scope === "visible") {
      const grid = snapshotGrid(terminal, { trimRight: true, includeStyles: true });
      lines = grid.lines;
      hash = fnv1a32(JSON.stringify(grid));

      const rowSignatures = lines.map((line, idx) => {
        const runs = grid.styleRuns?.[idx] ?? [];
        if (line === "" && runs.length === 0) return "";
        return `${line}\n${JSON.stringify(runs)}`;
      });

      changedLines = diffLineIndices(previousRowSignatures ?? [], rowSignatures);
      previousRowSignatures = rowSignatures;
    } else {
      lines = snapshotLines(terminal, { scope, trimRight: true });
      hash = fnv1a32(lines.join("\n"));
    }

    const viewHtml = renderSnapshotViewHtml({
      terminal,
      sessionId: "replay",
      scope,
      hash,
      lines,
      meta: getMeta(terminal),
      lineNumbers: true,
      changedLines,
      trimRight: true,
    });

    frames.push({ atSeconds, label, viewHtml });
  };

  for (const event of parsed.events) {
    const [time, type, data] = event;

    if (type === "o") {
      writeChain = writeChain.then(() => writeTerminal(terminal, data));
    } else if (type === "r") {
      void writeChain.then(() => {
        const resized = parseResize(data);
        if (resized) {
          terminal.resize(resized.cols, resized.rows);
        }
        capture(time, `resize ${data}`);
      });
    } else if (type === "m") {
      void writeChain.then(() => {
        capture(time, data ? `mark ${data}` : "mark");
      });
    } else {
      // input or unknown: no-op
    }
  }

  await writeChain;
  capture(parsed.events.at(-1)?.[0] ?? 0, "final");

  terminal.dispose();

  return renderHtml({
    header: parsed.header,
    term: termInfo,
    scope,
    frames,
    eventCount: parsed.events.length,
  });
}

async function writeTerminal(terminal: Terminal, data: string): Promise<void> {
  await new Promise<void>((resolve) => {
    terminal.write(data, resolve);
  });
}

function renderHtml(input: {
  header: Record<string, unknown>;
  term: { cols: number; rows: number; type: string };
  scope: SnapshotScope;
  frames: ReportFrame[];
  eventCount: number;
}): string {
  const title = coerceDisplayString(input.header.title) || "ptywright trace report";
  const command = coerceDisplayString(input.header.command);
  const timestamp = input.header.timestamp;

  const headerJson = JSON.stringify(input.header, null, 2);

  const framesHtml = input.frames
    .map((frame, idx) => {
      const safeLabel = escapeHtml(frame.label);
      return `
<section class="frame">
  <h2>${idx + 1}. t=${frame.atSeconds.toFixed(3)}s — ${safeLabel}</h2>
  <pre class="terminal">${frame.viewHtml}</pre>
</section>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        color-scheme: light dark;
      }
      body {
        margin: 0;
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto,
          Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";
        line-height: 1.4;
      }
      header {
        padding: 16px;
        border-bottom: 1px solid color-mix(in oklab, currentColor 20%, transparent);
      }
      header h1 {
        margin: 0 0 8px 0;
        font-size: 18px;
      }
      header .meta {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
          "Liberation Mono", "Courier New", monospace;
        font-size: 12px;
        opacity: 0.8;
        white-space: pre-wrap;
      }
      main {
        padding: 16px;
      }
      details {
        margin: 12px 0;
      }
      pre {
        margin: 8px 0 0 0;
        padding: 12px;
        overflow: auto;
        border-radius: 8px;
        background: color-mix(in oklab, currentColor 6%, transparent);
        border: 1px solid color-mix(in oklab, currentColor 14%, transparent);
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
          "Liberation Mono", "Courier New", monospace;
        font-size: 12px;
        line-height: 1.35;
      }
      .terminal .header {
        display: block;
        opacity: 0.75;
        margin-bottom: 6px;
      }
      .terminal .row {
        display: block;
      }
      .terminal .row.changed {
        background: color-mix(in oklab, #f59e0b 18%, transparent);
      }
      .terminal .ln {
        color: color-mix(in oklab, currentColor 55%, transparent);
        user-select: none;
      }
      .frame h2 {
        margin: 18px 0 0 0;
        font-size: 14px;
        font-weight: 600;
      }
    </style>
  </head>
  <body>
    <header>
      <h1>${escapeHtml(title)}</h1>
      <div class="meta">term=${escapeHtml(input.term.type)} ${input.term.cols}x${input.term.rows} scope=${escapeHtml(input.scope)} events=${input.eventCount}
command=${escapeHtml(command)}
timestamp=${escapeHtml(coerceDisplayString(timestamp))}</div>
      <details>
        <summary>Raw header JSON</summary>
        <pre>${escapeHtml(headerJson)}</pre>
      </details>
    </header>
    <main>
      ${framesHtml}
    </main>
  </body>
</html>`;
}

function renderSnapshotViewHtml(options: {
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
  const out: string[] = [`<span class="header">${escapeHtml(headerLine)}</span>`];

  if (options.scope === "visible") {
    for (let i = 0; i < options.lines.length; i += 1) {
      const n = i + 1;
      const prefix = options.lineNumbers ? `${String(n).padStart(digits, "0")}│ ` : "";
      const prefixHtml = options.lineNumbers ? `<span class="ln">${escapeHtml(prefix)}</span>` : "";

      const contentHtml = renderVisibleRowHtml(options.terminal, i, options.trimRight);
      const rowClass = options.changedLines.has(i) ? "row changed" : "row";
      out.push(`<span class="${rowClass}">${prefixHtml}${contentHtml}</span>`);
    }

    return out.join("\n");
  }

  // buffer scope: currently renders plain text only
  for (let i = 0; i < options.lines.length; i += 1) {
    const n = i + 1;
    const prefix = options.lineNumbers ? `${String(n).padStart(digits, "0")}│ ` : "";
    const prefixHtml = options.lineNumbers ? `<span class="ln">${escapeHtml(prefix)}</span>` : "";
    out.push(`<span class="row">${prefixHtml}${escapeHtml(options.lines[i] ?? "")}</span>`);
  }

  return out.join("\n");
}

function renderVisibleRowHtml(terminal: Terminal, rowIndex: number, trimRight: boolean): string {
  const buffer = terminal.buffer.active;
  const nullCell = buffer.getNullCell();

  const startY = buffer.viewportY;
  const line = buffer.getLine(startY + rowIndex);
  const endCol = trimRight ? findMeaningfulEndCol(line, terminal.cols, nullCell) : terminal.cols;

  type Segment = { key: string; style: CellStyle; text: string };

  const segments: Segment[] = [];

  let currentKey: string | null = null;
  let currentStyle: CellStyle | null = null;
  let currentText = "";

  const flush = () => {
    if (!currentStyle) return;
    if (currentText.length === 0) return;
    segments.push({
      key: currentKey ?? styleKey(currentStyle),
      style: currentStyle,
      text: currentText,
    });
    currentText = "";
  };

  for (let x = 0; x < endCol; x += 1) {
    const cell = line?.getCell(x, nullCell);
    if (!cell) {
      if (currentStyle) {
        flush();
        currentStyle = null;
        currentKey = null;
      }
      continue;
    }

    const width = cell.getWidth();
    if (width === 0) {
      continue;
    }

    const chars = cell.getChars() || " ";
    const style = extractStyle(cell);
    const key = styleKey(style);

    if (!currentStyle) {
      currentStyle = style;
      currentKey = key;
      currentText = chars;
      continue;
    }

    if (key === currentKey) {
      currentText += chars;
      continue;
    }

    flush();
    currentStyle = style;
    currentKey = key;
    currentText = chars;
  }

  if (currentStyle) {
    flush();
  }

  return segments.map((segment) => renderSegmentHtml(segment.text, segment.style)).join("");
}

function renderSegmentHtml(text: string, style: CellStyle): string {
  const safeText = escapeHtml(text);

  if (isDefaultStyle(style)) {
    return safeText;
  }

  const css = styleToCss(style);
  if (!css) {
    return `<span class="seg">${safeText}</span>`;
  }

  return `<span class="seg" style="${css}">${safeText}</span>`;
}

function styleToCss(style: CellStyle): string {
  let fg = colorToCss(style.fg);
  let bg = colorToCss(style.bg);

  if (style.inverse) {
    const tmp = fg;
    fg = bg;
    bg = tmp;
  }

  const decls: string[] = [];

  if (fg) decls.push(`color: ${fg}`);
  if (bg) decls.push(`background-color: ${bg}`);

  if (style.bold) decls.push("font-weight: 600");
  if (style.italic) decls.push("font-style: italic");
  if (style.dim) decls.push("opacity: 0.75");

  const decorations: string[] = [];
  if (style.underline) decorations.push("underline");
  if (style.strikethrough) decorations.push("line-through");
  if (decorations.length > 0) {
    decls.push(`text-decoration: ${decorations.join(" ")}`);
  }

  return decls.join("; ");
}

function colorToCss(color: Color): string | null {
  if (color.mode === "default") return null;

  if (color.mode === "rgb") {
    const value = color.value & 0xffffff;
    return `#${value.toString(16).padStart(6, "0")}`;
  }

  const idx = clampInt(color.value, 0, 255);
  return xterm256Color(idx);
}

function xterm256Color(idx: number): string {
  const table16 = [
    "#000000",
    "#800000",
    "#008000",
    "#808000",
    "#000080",
    "#800080",
    "#008080",
    "#c0c0c0",
    "#808080",
    "#ff0000",
    "#00ff00",
    "#ffff00",
    "#0000ff",
    "#ff00ff",
    "#00ffff",
    "#ffffff",
  ];

  if (idx < 16) return table16[idx] ?? "#000000";

  if (idx >= 16 && idx <= 231) {
    const c = [0, 95, 135, 175, 215, 255];
    const n = idx - 16;

    const r = c[Math.trunc(n / 36) % 6] ?? 0;
    const g = c[Math.trunc(n / 6) % 6] ?? 0;
    const b = c[n % 6] ?? 0;

    return `rgb(${r} ${g} ${b})`;
  }

  const gray = 8 + (idx - 232) * 10;
  const v = clampInt(gray, 0, 255);
  return `rgb(${v} ${v} ${v})`;
}

function diffLineIndices(previous: string[], next: string[]): Set<number> {
  const out = new Set<number>();
  const max = Math.max(previous.length, next.length);

  for (let i = 0; i < max; i += 1) {
    const a = previous[i] ?? "";
    const b = next[i] ?? "";
    if (a !== b) out.add(i);
  }

  return out;
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

function coerceDisplayString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return "";
  }
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getMeta(terminal: Terminal): TerminalMeta {
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

function parseAsciicast(cast: string): ParsedAsciicast {
  const lines = cast.trimEnd().split("\n");
  const header = safeJsonObject(lines[0]);

  const events: AsciicastEvent[] = [];
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const value = JSON.parse(line) as unknown;
    if (!Array.isArray(value) || value.length < 3) continue;

    const time = Number(value[0]);
    const type = String(value[1]);
    const data = String(value[2]);

    if (!Number.isFinite(time)) continue;

    if (type === "o" || type === "i" || type === "r" || type === "m") {
      events.push([time, type, data] as AsciicastEvent);
    }
  }

  return { header, events };
}

function safeJsonObject(line: string | undefined): Record<string, unknown> {
  if (!line) return {};
  try {
    const value = JSON.parse(line) as unknown;
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function getTermInfo(header: Record<string, unknown>): {
  cols: number;
  rows: number;
  type: string;
} {
  const version = Number(header.version ?? 2);

  if (version === 3) {
    const term = header.term as { cols?: unknown; rows?: unknown; type?: unknown } | undefined;
    const cols = clampInt(Number(term?.cols ?? 80), 1, 500);
    const rows = clampInt(Number(term?.rows ?? 24), 1, 300);
    const type = typeof term?.type === "string" ? term.type : "xterm-256color";
    return { cols, rows, type };
  }

  const cols = clampInt(Number(header.width ?? 80), 1, 500);
  const rows = clampInt(Number(header.height ?? 24), 1, 300);
  const type = typeof header.term === "string" ? header.term : "xterm-256color";
  return { cols, rows, type };
}

function parseResize(value: string): { cols: number; rows: number } | null {
  const match = /^\s*(\d+)x(\d+)\s*$/.exec(value);
  if (!match) return null;

  const cols = clampInt(Number(match[1] ?? 0), 1, 500);
  const rows = clampInt(Number(match[2] ?? 0), 1, 300);
  return { cols, rows };
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  const int = Math.trunc(value);
  if (int < min) return min;
  if (int > max) return max;
  return int;
}

if (import.meta.main) {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error("Usage: bun run src/trace/report.ts <path/to/cast>");
    process.exit(2);
  }

  const cast = await Bun.file(inputPath).text();
  const html = await generateTraceReportHtml(cast);

  const dir = dirname(inputPath);
  const base = basename(inputPath, extname(inputPath));
  const outPath = join(dir, `${base}.report.html`);

  writeFileSync(outPath, html);
  // eslint-disable-next-line no-console
  console.log(outPath);
}
