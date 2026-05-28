import { agentManifestPath, writeAgentManifestPath } from "./manifest";
import type { AgentCheckJsonSummary } from "./check_summary";
import type { AgentCheckResult } from "./check_types";

export function writeCheckManifest(result: AgentCheckResult, summary: AgentCheckJsonSummary): void {
  writeAgentManifestPath(agentManifestPath(result.artifactsRoot), {
    kind: "check",
    ok: result.ok,
    rootDir: result.artifactsRoot,
    primaryPath: result.summaryPath,
    commands: summary.commands,
    validation: {
      ok: result.validationBefore.ok && result.replay.ok && result.validationAfter.ok,
      stages: [
        {
          name: "inputs",
          ok: result.validationBefore.ok,
          totalCount: result.validationBefore.totalCount,
          failureCount: result.validationBefore.failureCount,
        },
        {
          name: "replay",
          ok: result.replay.ok,
          totalCount: result.replay.entries.length,
          failureCount: result.replay.entries.filter((entry) => !entry.result.ok).length,
        },
        {
          name: "outputs",
          ok: result.validationAfter.ok,
          totalCount: result.validationAfter.totalCount,
          failureCount: result.validationAfter.failureCount,
        },
      ],
    },
    files: [
      { path: result.summaryPath, kind: "check-summary", role: "summary", ok: result.ok },
      {
        path: result.replay.summaryPath,
        kind: "replay-summary",
        role: "replay-summary",
        ok: result.replay.ok,
      },
      {
        path: result.replay.reportPath,
        kind: "report",
        role: "replay-report",
        ok: result.replay.ok,
      },
      ...result.replay.entries.flatMap((entry) => [
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
