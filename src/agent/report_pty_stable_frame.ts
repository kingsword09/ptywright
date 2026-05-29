import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

import { Terminal } from "@xterm/headless";

import type { PtywrightAgentReportStableFrameFlowConfig, ResolvedPtywrightConfig } from "../config";
import { base64ToBytes } from "../pty-cassette/data";
import {
  DEFAULT_STYLE,
  extractStyle,
  findMeaningfulEndCol,
  isDefaultStyle,
  styleKey,
  type CellStyle,
  type Color,
} from "../terminal/style";
import { escapeAttribute, escapeHtml } from "./html_escape";
import {
  type AgentReportAittyViewerAssets,
  renderAittyPreviewAssetTags,
  renderAittyPreviewBody,
  renderAittyPreviewCss,
} from "./report_aitty_preview";
import { readFlagValueFromArgSets, readReportLaunchArgSets } from "./report_launch_args";
import type { TerminalSnapshotLayout } from "./report_terminal_layout";
import { isMobileViewport, type AgentReportViewOptions } from "./report_view_options";
import type { AgentRunResult } from "./runner";
import type { AgentViewport } from "./schema";

type RawPtyReplayEvent =
  | {
      atMs?: number;
      dataBase64?: string;
      type: "input" | "output";
    }
  | {
      atMs?: number;
      cols?: number;
      rows?: number;
      type: "resize";
    }
  | {
      atMs?: number;
      type: "exit";
    };

type RawPtyReplayRecording = {
  command?: {
    cols?: number;
    rows?: number;
  };
  cols?: number;
  events?: RawPtyReplayEvent[];
  rows?: number;
  terminal?: {
    cols?: number;
    rows?: number;
  };
};

type StableFrameConfig = Required<
  Pick<PtywrightAgentReportStableFrameFlowConfig, "stableMs" | "theme" | "viewportOnly">
> &
  Omit<PtywrightAgentReportStableFrameFlowConfig, "stableMs" | "theme" | "viewportOnly">;

export type StableCell = {
  style: CellStyle;
  text: string;
  width: number;
};

export type StableLogicalLine = {
  cells: StableCell[];
  live: boolean;
  physicalRows: number;
};

export type PtyReplayStableFrame = {
  atMs: number;
  cols: number;
  index: number;
  lines: StableLogicalLine[];
  reason: string;
  rows: number;
};

type CapturedStableFrame = PtyReplayStableFrame & {
  score: number;
};

type StableFrameMatcher = {
  matches: (text: string) => boolean;
  mode: "first" | "last";
};

export async function extractPtyReplayStableFrameForReport(args: {
  config?: ResolvedPtywrightConfig;
  result: AgentRunResult;
}): Promise<PtyReplayStableFrame | null> {
  const launchArgSets = readReportLaunchArgSets(args.result);
  const replayPathArg = readFlagValueFromArgSets(launchArgSets, "--pty-replay");
  if (!replayPathArg) return null;

  const config = resolveStableFrameConfig(args.config, args.result.name);
  if (config.enabled === false || config.skip) return null;

  const replayPath = resolvePtyReplayPath(replayPathArg, args.config);
  if (!existsSync(replayPath)) return null;

  const recording = JSON.parse(readFileSync(replayPath, "utf8")) as RawPtyReplayRecording;
  const events = Array.isArray(recording.events) ? recording.events : [];
  const firstResize = events.find((event) => event.type === "resize");
  const initialCols =
    config.cols ??
    recording.terminal?.cols ??
    recording.command?.cols ??
    recording.cols ??
    firstResize?.cols ??
    80;
  const initialRows =
    config.rows ??
    recording.terminal?.rows ??
    recording.command?.rows ??
    recording.rows ??
    firstResize?.rows ??
    24;

  const terminal = new Terminal({
    allowProposedApi: true,
    cols: initialCols,
    convertEol: true,
    rows: initialRows,
    scrollback: 20_000,
  });

  try {
    return await extractStableFrame({ config, events, terminal });
  } finally {
    terminal.dispose();
  }
}

export function renderPtyReplayStableFramePreviewDocument(args: {
  aittyAssets: AgentReportAittyViewerAssets;
  frame: PtyReplayStableFrame;
  viewOptions: AgentReportViewOptions;
  viewport?: AgentViewport;
  config?: ResolvedPtywrightConfig;
  flowName: string;
}): string {
  const stableFrameConfig = resolveStableFrameConfig(args.config, args.flowName);
  const targetCols = resolveTargetCols({
    config: stableFrameConfig,
    fontSize: args.viewOptions.fontSize,
    frameCols: args.frame.cols,
    viewport: args.viewport,
  });
  const snapshot = renderStableFrameDom(args.frame, targetCols);
  const snapshotLayout: TerminalSnapshotLayout = {
    cols: targetCols,
    fontSize: args.viewOptions.fontSize,
    lineHeight: args.viewOptions.lineHeight,
    paddingInline: isMobileViewport(args.viewport) ? 16 : 32,
    rows: args.frame.rows,
  };
  const body = renderAittyPreviewBody({
    snapshot,
    snapshotLayout,
    viewOptions: args.viewOptions,
  });
  const style = renderAittyPreviewCss(args.viewOptions);
  const assetTags = renderAittyPreviewAssetTags(args.aittyAssets);

  return `<!doctype html>
<html lang="en" data-theme="${escapeAttribute(args.viewOptions.theme)}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>stable-frame preview (atMs=${args.frame.atMs})</title>
${assetTags}    <style>
${style}
    </style>
  </head>
  <body>
${body}
  </body>
</html>`;
}

function resolveStableFrameConfig(
  config: ResolvedPtywrightConfig | undefined,
  flowName: string,
): StableFrameConfig {
  const stableFrames = config?.agent?.report?.stableFrames;
  const flowConfig = stableFrames?.flows?.[flowName];

  return {
    ...stableFrames,
    ...flowConfig,
    stableMs: flowConfig?.stableMs ?? stableFrames?.stableMs ?? 200,
    theme: flowConfig?.theme ?? stableFrames?.theme ?? "dark",
    viewportOnly: flowConfig?.viewportOnly ?? stableFrames?.viewportOnly ?? false,
    viewportTargets: {
      ...stableFrames?.viewportTargets,
      ...flowConfig?.viewportTargets,
    },
  };
}

function resolvePtyReplayPath(
  replayPathArg: string,
  config: ResolvedPtywrightConfig | undefined,
): string {
  if (isAbsolute(replayPathArg)) return replayPathArg;
  return resolve(config?.rootDir ?? process.cwd(), replayPathArg);
}

async function extractStableFrame(args: {
  config: StableFrameConfig;
  events: readonly RawPtyReplayEvent[];
  terminal: Terminal;
}): Promise<PtyReplayStableFrame | null> {
  const { config, events, terminal } = args;
  const targetFrameIndex = config.frameIndex;
  const matcher = createStableFrameMatcher(config);
  let matchedFrame: CapturedStableFrame | null = null;
  const retainedFrames: CapturedStableFrame[] = [];
  const retainCount =
    targetFrameIndex === undefined ? 24 : targetFrameIndex < 0 ? -targetFrameIndex : 1;
  let totalFrames = 0;
  let pendingDirtySinceMs: number | null = null;
  let lastEventAtMs = 0;

  const captureFrame = (atMs: number, reason: string): void => {
    const shouldRetain =
      targetFrameIndex === undefined ||
      (targetFrameIndex >= 0 && totalFrames === targetFrameIndex) ||
      targetFrameIndex < 0;

    if (shouldRetain || matcher) {
      const frame = {
        ...snapshotTerminalFrame(terminal, {
          atMs,
          index: totalFrames,
          reason,
          viewportOnly: config.viewportOnly,
        }),
        score: scoreTerminalFrame(terminal),
      };

      if (matcher?.matches(stableFrameText(frame))) {
        if (matcher.mode === "last" || !matchedFrame) {
          matchedFrame = frame;
        }
      }

      if (shouldRetain) {
        retainedFrames.push(frame);
      }
      if (retainedFrames.length > retainCount) {
        retainedFrames.splice(0, retainedFrames.length - retainCount);
      }
    }

    totalFrames += 1;
    pendingDirtySinceMs = null;
  };

  const flushIfStable = (nowMs: number): void => {
    if (pendingDirtySinceMs === null) return;
    if (nowMs - pendingDirtySinceMs >= config.stableMs) {
      captureFrame(pendingDirtySinceMs, "stable");
    }
  };

  for (const event of events) {
    const atMs = event.atMs ?? lastEventAtMs;
    flushIfStable(atMs);
    lastEventAtMs = atMs;

    if (event.type === "output" && event.dataBase64) {
      await writeTerminal(terminal, base64ToBytes(event.dataBase64));
      pendingDirtySinceMs = pendingDirtySinceMs ?? atMs;
      continue;
    }

    if (event.type === "resize" && event.cols && event.rows) {
      terminal.resize(event.cols, event.rows);
      pendingDirtySinceMs = pendingDirtySinceMs ?? atMs;
      continue;
    }

    if (event.type === "exit") {
      flushIfStable(atMs);
    }
  }

  flushIfStable(lastEventAtMs + config.stableMs);
  if (totalFrames === 0) captureFrame(lastEventAtMs, "final");

  if (targetFrameIndex !== undefined && targetFrameIndex >= 0) {
    const exact = retainedFrames.find((frame) => frame.index === targetFrameIndex);
    if (exact) return exact;
    return null;
  }

  if (targetFrameIndex !== undefined && targetFrameIndex < 0) {
    const resolved = totalFrames + targetFrameIndex;
    const exact = retainedFrames.find((frame) => frame.index === resolved);
    if (exact) return exact;
  }

  if (matchedFrame) return matchedFrame;

  return chooseBestStableFrame(retainedFrames);
}

function writeTerminal(terminal: Terminal, data: Uint8Array): Promise<void> {
  return new Promise((resolveWrite) => {
    terminal.write(data, resolveWrite);
  });
}

function snapshotTerminalFrame(
  terminal: Terminal,
  options: {
    atMs: number;
    index: number;
    reason: string;
    viewportOnly: boolean;
  },
): PtyReplayStableFrame {
  const buffer = terminal.buffer.active;
  const startY = options.viewportOnly ? buffer.viewportY : 0;
  const count = options.viewportOnly ? terminal.rows : buffer.length;
  const logicalLines: StableLogicalLine[] = [];

  for (let offset = 0; offset < count; offset += 1) {
    const y = startY + offset;
    const line = buffer.getLine(y);
    const cells = readStableLineCells(terminal, y);
    const live = options.viewportOnly || y >= buffer.viewportY;
    const previous = logicalLines.at(-1);

    if (line?.isWrapped && previous) {
      previous.cells.push(...cells);
      previous.live = previous.live || live;
      previous.physicalRows += 1;
      continue;
    }

    logicalLines.push({ cells, live, physicalRows: 1 });
  }

  return {
    atMs: options.atMs,
    cols: terminal.cols,
    index: options.index,
    lines: logicalLines,
    reason: options.reason,
    rows: terminal.rows,
  };
}

function readStableLineCells(terminal: Terminal, y: number): StableCell[] {
  const buffer = terminal.buffer.active;
  const nullCell = buffer.getNullCell();
  const line = buffer.getLine(y);
  const endCol = findMeaningfulEndCol(line, terminal.cols, nullCell);
  const cells: StableCell[] = [];

  for (let x = 0; x < endCol; x += 1) {
    const cell = line?.getCell(x, nullCell);
    if (!cell) {
      cells.push({ style: DEFAULT_STYLE, text: " ", width: 1 });
      continue;
    }

    const width = cell.getWidth();
    if (width === 0) continue;

    cells.push({
      style: extractStyle(cell),
      text: cell.getChars() || " ",
      width,
    });
  }

  return cells;
}

function scoreTerminalFrame(terminal: Terminal): number {
  const buffer = terminal.buffer.active;
  const nullCell = buffer.getNullCell();
  let score = 0;

  for (let y = 0; y < buffer.length; y += 1) {
    const line = buffer.getLine(y);
    const endCol = findMeaningfulEndCol(line, terminal.cols, nullCell);
    score += endCol;
  }

  return score;
}

function chooseBestStableFrame(
  frames: readonly CapturedStableFrame[],
): PtyReplayStableFrame | null {
  const meaningful = frames.filter((frame) => frame.score > 0);
  return meaningful.at(-1) ?? frames.at(-1) ?? null;
}

function createStableFrameMatcher(config: StableFrameConfig): StableFrameMatcher | null {
  const matchText = toStringArray(config.matchText);
  const matchRegex = toStringArray(config.matchRegex).map((pattern) => {
    try {
      return new RegExp(pattern);
    } catch (error) {
      throw new Error(
        `invalid agent.report.stableFrames.matchRegex pattern ${JSON.stringify(pattern)}: ${String(error)}`,
      );
    }
  });

  if (matchText.length === 0 && matchRegex.length === 0) return null;

  return {
    mode: config.matchMode ?? "last",
    matches: (text: string): boolean =>
      matchText.some((needle) => text.includes(needle)) ||
      matchRegex.some((regex) => regex.test(text)),
  };
}

function stableFrameText(frame: PtyReplayStableFrame): string {
  return frame.lines
    .map((line) =>
      line.cells
        .map((cell) => cell.text)
        .join("")
        .trimEnd(),
    )
    .join("\n");
}

function toStringArray(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function resolveTargetCols(args: {
  config: StableFrameConfig;
  fontSize: number;
  frameCols: number;
  viewport?: AgentViewport;
}): number {
  const explicit = args.viewport ? args.config.viewportTargets?.[args.viewport.name] : undefined;
  if (typeof explicit === "number" && Number.isFinite(explicit) && explicit > 0) {
    return Math.trunc(explicit);
  }
  if (explicit === null) return args.frameCols;

  if (isMobileViewport(args.viewport)) {
    const width = args.viewport?.width ?? 390;
    const cellWidth = Math.max(1, args.fontSize * 0.6);
    return Math.max(20, Math.floor(width / cellWidth));
  }

  return args.frameCols;
}

function renderStableFrameDom(frame: PtyReplayStableFrame, targetCols: number): string {
  let html = "";
  let totalRows = 0;
  let wideBlockId = 0;

  for (const line of frame.lines) {
    const lineCols = cellsDisplayWidth(line.cells);
    const wide = shouldRenderViewportPan(line, lineCols, targetCols);

    if (wide) {
      wideBlockId += 1;
      const blockCols = Math.max(targetCols, lineCols);
      html += `<div class="term-wide-row-block" data-aitty-wide-block="true" data-aitty-wide-block-id="${wideBlockId}" data-aitty-wide-block-kind="viewport-pan" style="--aitty-wide-block-cols: ${blockCols}">`;
      html += renderStableFrameRow(line, blockCols, totalRows);
      html += "</div>";
      totalRows += 1;
    } else {
      for (const row of wrapStableLogicalLine(line, targetCols)) {
        html += renderStableFrameRow(row, targetCols, totalRows);
        totalRows += 1;
      }
    }
  }

  return `<div class="term-grid" data-cols="${targetCols}" data-rows="${totalRows}" style="--term-cols: ${targetCols}; --term-rows: ${totalRows};">${html}</div>`;
}

function shouldRenderViewportPan(
  line: StableLogicalLine,
  lineCols: number,
  targetCols: number,
): boolean {
  if (lineCols <= targetCols) return false;
  return isDiffLikeLine(stableLineText(line));
}

function stableLineText(line: StableLogicalLine): string {
  return line.cells
    .map((cell) => cell.text)
    .join("")
    .trimEnd();
}

function isDiffLikeLine(text: string): boolean {
  const normalized = text.replace(/[│┃┆┊▏▕]/g, " ").trimStart();
  if (normalized === "") return false;

  if (/^(?:diff --git|index [0-9a-f]{6,}\.\.|@@\s|[-+]{3}\s)/.test(normalized)) {
    return true;
  }

  if (/^\d+\s+[+-]/.test(normalized)) return true;

  const signed = normalized.match(/^[+-]\s*(.*)$/);
  if (!signed) return false;
  return isCodeLikeText(signed[1] ?? "");
}

function isCodeLikeText(text: string): boolean {
  return (
    /[{}()[\];=<>]/.test(text) ||
    /\b(?:async|await|class|const|def|export|from|function|if|import|interface|let|return|type|var)\b/.test(
      text,
    ) ||
    /(?:^|\s)(?:--?[a-z][\w-]*|#[\w-]+|\/[A-Za-z0-9._/-]+)(?:\s|$)/.test(text)
  );
}

function wrapStableLogicalLine(line: StableLogicalLine, targetCols: number): StableLogicalLine[] {
  const lineCols = cellsDisplayWidth(line.cells);
  if (lineCols <= targetCols) return [line];

  const rows: StableLogicalLine[] = [];
  let cells: StableCell[] = [];
  let cols = 0;

  const flush = (): void => {
    rows.push({ cells, live: line.live, physicalRows: 1 });
    cells = [];
    cols = 0;
  };

  for (const cell of line.cells) {
    if (cols > 0 && cols + cell.width > targetCols) {
      flush();
    }

    cells.push(cell);
    cols += cell.width;

    if (cols >= targetCols) {
      flush();
    }
  }

  if (cells.length > 0 || rows.length === 0) {
    flush();
  }

  return rows;
}

function renderStableFrameRow(
  line: StableLogicalLine,
  lineCols: number,
  lineIndex: number,
): string {
  const className = line.live ? "term-row" : "term-row term-scrollback-row";
  const liveAttr = line.live ? ` data-aitty-live-grid-row="${lineIndex + 1}"` : "";
  return `<div class="${className}"${liveAttr} data-aitty-line-cols="${lineCols}">${renderStableFrameCells(line.cells, lineCols)}</div>`;
}

function renderStableFrameCells(cells: readonly StableCell[], lineCols: number): string {
  const out: string[] = [];
  let usedCols = 0;
  let runText = "";
  let runWidth = 0;
  let runStyle: CellStyle | null = null;
  let runKey: string | null = null;

  const flush = (): void => {
    if (runText === "" && runWidth === 0) return;
    out.push(renderSpan(runText, runWidth, runStyle ?? DEFAULT_STYLE));
    runText = "";
    runWidth = 0;
    runStyle = null;
    runKey = null;
  };

  for (const cell of cells) {
    const key = styleKey(cell.style);
    const wide = cell.width !== 1;
    if (!wide && runKey === key) {
      runText += cell.text;
      runWidth += cell.width;
      usedCols += cell.width;
      continue;
    }

    flush();

    if (wide) {
      out.push(renderSpan(cell.text, cell.width, cell.style, "term-wide"));
      usedCols += cell.width;
      continue;
    }

    runText = cell.text;
    runWidth = cell.width;
    runStyle = cell.style;
    runKey = key;
    usedCols += cell.width;
  }
  flush();

  const remaining = lineCols - usedCols;
  if (remaining > 0) {
    out.push(renderSpan("", remaining, DEFAULT_STYLE));
  }

  return out.join("");
}

function renderSpan(text: string, width: number, style: CellStyle, className?: string): string {
  const declarations = styleDeclarations(style);
  declarations.push(widthDeclaration(width));
  if (className === "term-wide") {
    declarations.push("overflow: hidden");
  }
  const classAttr = className ? ` class="${escapeAttribute(className)}"` : "";
  return `<span${classAttr} style="${escapeAttribute(declarations.join("; "))}">${escapeHtml(text)}</span>`;
}

function styleDeclarations(style: CellStyle): string[] {
  if (isDefaultStyle(style)) return [];

  const declarations: string[] = [];
  const fg = colorToCss(style.fg);
  const bg = colorToCss(style.bg);
  if (fg) declarations.push(`color: ${fg}`);
  if (bg) declarations.push(`background-color: ${bg}`);
  if (style.bold) declarations.push("font-weight: 700");
  if (style.dim) declarations.push("opacity: 0.72");
  if (style.italic) declarations.push("font-style: italic");

  const decorations = [
    style.underline ? "underline" : "",
    style.strikethrough ? "line-through" : "",
  ].filter(Boolean);
  if (decorations.length > 0) {
    declarations.push(`text-decoration: ${decorations.join(" ")}`);
  }
  if (style.inverse) declarations.push("filter: invert(1)");

  return declarations;
}

function colorToCss(color: Color): string | null {
  if (color.mode === "default") return null;
  if (color.mode === "palette") return paletteColorToCss(color.value);

  const value = color.value;
  const r = (value >> 16) & 0xff;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;
  return `rgb(${r},${g},${b})`;
}

function paletteColorToCss(value: number): string {
  if (value >= 0 && value <= 15) return `var(--term-color-${value})`;

  if (value >= 16 && value <= 231) {
    const index = value - 16;
    const steps = [0, 95, 135, 175, 215, 255];
    const r = steps[Math.floor(index / 36)] ?? 0;
    const g = steps[Math.floor((index % 36) / 6)] ?? 0;
    const b = steps[index % 6] ?? 0;
    return `rgb(${r},${g},${b})`;
  }

  if (value >= 232 && value <= 255) {
    const channel = 8 + (value - 232) * 10;
    return `rgb(${channel},${channel},${channel})`;
  }

  return `var(--term-color-${value})`;
}

function widthDeclaration(width: number): string {
  if (width <= 1) return "width: var(--term-cell-width, 1ch)";
  return `width: calc(var(--term-cell-width, 1ch) * ${width})`;
}

function cellsDisplayWidth(cells: readonly StableCell[]): number {
  return cells.reduce((sum, cell) => sum + cell.width, 0);
}
