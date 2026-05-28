import { agentManifestPath, writeAgentManifestPath } from "./manifest";
import { formatAgentReplaySummary } from "./replay_all_summary";
import type { AgentReplayAllEntry } from "./replay_all_types";

export function writeReplayAllManifest(result: {
  ok: boolean;
  dir: string;
  suiteDir: string;
  reportPath: string;
  summaryPath: string;
  updateSnapshots: boolean;
  entries: AgentReplayAllEntry[];
}): void {
  const summary = formatAgentReplaySummary({
    ok: result.ok,
    dir: result.dir,
    suiteDir: result.suiteDir,
    durationMs: 0,
    reportPath: result.reportPath,
    summaryPath: result.summaryPath,
    updateSnapshots: result.updateSnapshots,
    entries: result.entries,
  });
  writeAgentManifestPath(agentManifestPath(result.suiteDir), {
    kind: "replay-suite",
    ok: result.ok,
    rootDir: result.suiteDir,
    primaryPath: result.summaryPath,
    commands: summary.commands,
    validation: {
      ok: result.ok,
      stages: [
        {
          name: "replay",
          ok: result.ok,
          totalCount: result.entries.length,
          failureCount: result.entries.filter((entry) => !entry.result.ok).length,
        },
      ],
    },
    files: [
      { path: result.summaryPath, kind: "replay-summary", role: "summary", ok: result.ok },
      { path: result.reportPath, kind: "report", role: "report", ok: result.ok },
      ...result.entries.flatMap((entry) => [
        {
          path: entry.result.recordPath,
          kind: "run-record" as const,
          role: "record",
          ok: entry.result.ok,
        },
        {
          path: entry.result.reportPath,
          kind: "report" as const,
          role: "entry-report",
          ok: entry.result.ok,
        },
        ...entry.result.artifacts.flatMap((artifact) => [
          {
            path: artifact.path,
            kind: artifact.kind,
            role: "artifact",
            ok: artifact.ok,
          },
          {
            path: artifact.diffPath,
            kind: "diff" as const,
            role: "diff",
            ok: artifact.ok,
          },
        ]),
      ]),
    ],
  });
}
