import type { AgentViewport } from "./schema";
import { isMobileViewport, type AgentReportViewOptions } from "./report_view_options";

export type TerminalSnapshotLayout = {
  cols: number;
  fontSize: number;
  lineHeight: number;
  paddingInline: number;
  rows: number;
};

export function resolveTerminalSnapshotLayout(
  snapshot: string,
  viewport: AgentViewport | undefined,
  viewOptions: AgentReportViewOptions,
): TerminalSnapshotLayout {
  const cols = inferTerminalCols(snapshot);
  const rows = inferTerminalRows(snapshot);
  const mobile = isMobileViewport(viewport);
  const fontSize = viewOptions.fontSize;
  const lineHeight = viewOptions.lineHeight;
  const paddingInline = mobile ? 16 : 32;

  return {
    cols,
    fontSize,
    lineHeight,
    paddingInline,
    rows,
  };
}

function inferTerminalCols(snapshot: string): number {
  const dataCols = /data-cols="(\d+)"/.exec(snapshot)?.[1];
  const styleCols = /--term-cols:\s*(\d+)/.exec(snapshot)?.[1];
  const parsed = Number.parseInt(dataCols ?? styleCols ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 80;
}

function inferTerminalRows(snapshot: string): number {
  const dataRows = /data-rows="(\d+)"/.exec(snapshot)?.[1];
  const styleRows = /--term-rows:\s*(\d+)/.exec(snapshot)?.[1];
  const parsed = Number.parseInt(dataRows ?? styleRows ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 24;
}
