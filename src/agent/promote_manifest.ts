import { agentManifestPath, writeAgentManifestPath } from "./manifest";
import { formatAgentPromoteSummary } from "./promote_format";
import type { AgentPromoteResult } from "./promote_types";

export function writePromoteManifest(result: AgentPromoteResult): void {
  const summary = formatAgentPromoteSummary(result);
  writeAgentManifestPath(agentManifestPath(result.artifactsRoot), {
    kind: "promote",
    ok: result.ok,
    rootDir: result.artifactsRoot,
    primaryPath: result.summaryPath,
    commands: summary.commands,
    validation: {
      ok: result.validation.ok && result.replay.ok,
      stages: [
        {
          name: "validation",
          ok: result.validation.ok,
          totalCount: result.validation.totalCount,
          failureCount: result.validation.failureCount,
        },
        {
          name: "replay",
          ok: result.replay.ok,
          totalCount: result.replay.entries.length,
          failureCount: result.replay.entries.filter((entry) => !entry.result.ok).length,
        },
      ],
    },
    files: [
      { path: result.summaryPath, kind: "promote-summary", role: "summary", ok: result.ok },
      { path: result.targetCassettePath, kind: "cassette", role: "promoted-cassette" },
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
