import type { SnapshotScope } from "../terminal/snapshot";
import { parseAsciicast } from "./asciicast_parse";
import { runTraceReportCli } from "./report_cli";
import { buildTraceReportFrames } from "./report_frames";
import { renderTraceReportHtml } from "./report_html";
import type { TraceReportArtifacts, TraceReportResult } from "./report_types";
import { getTermInfo } from "./term_info";

export type { TraceReportArtifacts, TraceReportFrame, TraceReportResult } from "./report_types";

export async function generateTraceReportHtml(
  cast: string,
  options?: {
    scope?: SnapshotScope;
    maxFrames?: number;
    scriptName?: string;
    result?: TraceReportResult;
    artifacts?: TraceReportArtifacts;
    steps?: unknown[]; // Should be ScriptStep execution records
  },
): Promise<string> {
  const parsed = parseAsciicast(cast);
  const termInfo = getTermInfo(parsed.header);

  const scope = options?.scope ?? "visible";
  const maxFrames = options?.maxFrames ?? 200;
  const scriptName = options?.scriptName?.trim() ? options.scriptName.trim() : "";
  const result = options?.result;
  const artifacts = options?.artifacts;
  const frames = await buildTraceReportFrames({
    parsed,
    term: termInfo,
    scope,
    maxFrames,
    steps: options?.steps,
  });

  return renderTraceReportHtml({
    cast,
    header: parsed.header,
    term: termInfo,
    scope,
    scriptName,
    result,
    artifacts,
    frames,
    eventCount: parsed.events.length,
  });
}

if (import.meta.main) {
  await runTraceReportCli(process.argv.slice(2), generateTraceReportHtml);
}
