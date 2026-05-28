import {
  AGENT_PROMOTE_SCHEMA_URL,
  defaultAgentPromoteCommands,
  normalizeAgentPromoteSummary,
  type AgentPromoteSummary,
} from "./promote_summary";
import type { AgentPromoteResult } from "./promote_types";

export function formatAgentPromoteSummary(result: AgentPromoteResult): AgentPromoteSummary {
  const replayFailures = result.replay.entries.filter((entry) => !entry.result.ok);
  return normalizeAgentPromoteSummary({
    $schema: AGENT_PROMOTE_SCHEMA_URL,
    version: 1,
    ok: result.ok,
    sourcePath: result.sourcePath,
    cassetteDir: result.cassetteDir,
    targetDir: result.targetDir,
    targetCassettePath: result.targetCassettePath,
    snapshotDir: result.snapshotDir,
    artifactsRoot: result.artifactsRoot,
    summaryPath: result.summaryPath,
    updateSnapshots: result.updateSnapshots,
    commands: defaultAgentPromoteCommands(result),
    validation: {
      ok: result.validation.ok,
      totalCount: result.validation.totalCount,
      failureCount: result.validation.failureCount,
    },
    replay: {
      ok: result.replay.ok,
      totalCount: result.replay.entries.length,
      failureCount: replayFailures.length,
      reportPath: result.replay.reportPath,
      summaryPath: result.replay.summaryPath,
    },
    failures: [
      ...result.validation.entries
        .filter((entry) => !entry.ok)
        .map((entry) => ({
          stage: "validation" as const,
          filePath: entry.filePath,
          kind: entry.kind,
          errors: entry.error ? [entry.error] : [],
        })),
      ...replayFailures.map((entry) => ({
        stage: "replay" as const,
        filePath: entry.filePath,
        errors: entry.result.errors,
      })),
    ],
  });
}

export function formatAgentPromoteLines(result: AgentPromoteResult): string[] {
  const replayFailureCount = result.replay.entries.filter((entry) => !entry.result.ok).length;
  return [
    `${result.ok ? "ok" : "failed"} agent-promote`,
    `source=${result.sourcePath}`,
    `cassette=${result.targetCassettePath}`,
    `snapshots=${result.snapshotDir}`,
    `summary=${result.summaryPath}`,
    result.replay.reportPath ? `report=${result.replay.reportPath}` : null,
    `validation=${result.validation.ok ? "ok" : "failed"} failures=${result.validation.failureCount}/${result.validation.totalCount}`,
    `replay=${result.replay.ok ? "ok" : "failed"} failures=${replayFailureCount}/${result.replay.entries.length}`,
    ...result.validation.entries
      .filter((entry) => !entry.ok)
      .flatMap((entry) => [`- validation ${entry.filePath}`, `  error=${entry.error ?? ""}`]),
    ...result.replay.entries
      .filter((entry) => !entry.result.ok)
      .flatMap((entry) => [
        `- replay ${entry.filePath}`,
        ...entry.result.errors.map((error) => `  error=${error}`),
      ]),
  ].filter(Boolean) as string[];
}
