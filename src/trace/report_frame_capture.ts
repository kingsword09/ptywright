import { Terminal } from "@xterm/headless";

import { snapshotGrid, snapshotLines, type SnapshotScope } from "../terminal/snapshot";
import { fnv1a32 } from "../util/hash";
import {
  diffLineIndices,
  getTerminalMeta,
  parseSnapshotViewText,
  renderSnapshotViewHtml,
  renderSnapshotViewTextHtml,
} from "./report_snapshot_view";
import type { TraceReportFrame } from "./report_types";

export type TraceFrameCapture = (captureArgs: {
  atSeconds: number;
  kind: TraceReportFrame["kind"];
  label: string;
  markLabel?: string;
  stepInfo?: TraceReportFrame["stepInfo"];
  overrideViewText?: { text: string; hash?: string };
}) => void;

export function createFrameCapture(args: {
  terminal: Terminal;
  frames: TraceReportFrame[];
  scope: SnapshotScope;
  maxFrames: number;
}): TraceFrameCapture {
  let previousRowSignatures: string[] | null = null;

  return (captureArgs): void => {
    if (args.frames.length >= args.maxFrames) return;

    const view = captureArgs.overrideViewText
      ? renderOverrideView(captureArgs.overrideViewText, previousRowSignatures)
      : renderTerminalView(args.terminal, args.scope, previousRowSignatures);

    previousRowSignatures = view.rowSignatures;

    const previousFrame = args.frames.at(-1);
    args.frames.push({
      id: `frame-${args.frames.length + 1}`,
      atSeconds: captureArgs.atSeconds,
      kind: captureArgs.kind,
      label: captureArgs.label,
      markLabel: captureArgs.markLabel,
      viewHtml: view.viewHtml,
      changedCount: view.changedCount,
      stepInfo: captureArgs.stepInfo,
      previousViewHtml: previousFrame?.viewHtml,
    });
  };
}

function renderOverrideView(
  overrideViewText: { text: string; hash?: string },
  previousRowSignatures: string[] | null,
): {
  viewHtml: string;
  changedCount: number;
  rowSignatures: string[];
} {
  const parsedView = parseSnapshotViewText(overrideViewText.text);
  const headerLine =
    parsedView.headerLine ??
    (overrideViewText.hash?.trim() ? `hash=${overrideViewText.hash.trim()}` : "snapshot");

  const rowSignatures = parsedView.rows.map((row) => row.text);
  const changedLines = diffLineIndices(previousRowSignatures ?? [], rowSignatures);

  return {
    rowSignatures,
    changedCount: changedLines.size,
    viewHtml: renderSnapshotViewTextHtml({
      headerLine,
      rows: parsedView.rows,
      changedLines,
    }),
  };
}

function renderTerminalView(
  terminal: Terminal,
  scope: SnapshotScope,
  previousRowSignatures: string[] | null,
): {
  viewHtml: string;
  changedCount: number;
  rowSignatures: string[];
} {
  let lines: string[];
  let hash: string;
  let changedLines = new Set<number>();
  let rowSignatures: string[];

  if (scope === "visible") {
    const grid = snapshotGrid(terminal, { trimRight: true, includeStyles: true });
    lines = grid.lines;
    hash = fnv1a32(JSON.stringify(grid));

    rowSignatures = lines.map((line, idx) => {
      const runs = grid.styleRuns?.[idx] ?? [];
      if (line === "" && runs.length === 0) return "";
      return `${line}\n${JSON.stringify(runs)}`;
    });

    changedLines = diffLineIndices(previousRowSignatures ?? [], rowSignatures);
  } else {
    lines = snapshotLines(terminal, { scope, trimRight: true });
    hash = fnv1a32(lines.join("\n"));
    rowSignatures = previousRowSignatures ?? [];
  }

  return {
    rowSignatures,
    changedCount: changedLines.size,
    viewHtml: renderSnapshotViewHtml({
      terminal,
      sessionId: "replay",
      scope,
      hash,
      lines,
      meta: getTerminalMeta(terminal),
      lineNumbers: true,
      changedLines,
      trimRight: true,
    }),
  };
}
