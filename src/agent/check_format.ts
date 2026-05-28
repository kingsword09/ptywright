import {
  AGENT_CHECK_SCHEMA_URL,
  normalizeAgentCheckJsonSummary,
  type AgentCheckJsonSummary,
} from "./check_summary";
import type { AgentCheckResult } from "./check_types";

export function formatAgentCheckLines(result: AgentCheckResult): string[] {
  return [
    `${result.ok ? "ok" : "failed"} agent-check`,
    `inputs=${result.validationBefore.totalCount} failures=${result.validationBefore.failureCount}`,
    result.replay.summaryPath ? `summary=${result.replay.summaryPath}` : null,
    `checkSummary=${result.summaryPath}`,
    result.replay.reportPath ? `report=${result.replay.reportPath}` : null,
    `outputs=${result.validationAfter.totalCount} failures=${result.validationAfter.failureCount}`,
    ...result.validationBefore.entries
      .filter((entry) => !entry.ok)
      .flatMap((entry) => [`- input ${entry.filePath}`, `  error=${entry.error ?? ""}`]),
    ...result.replay.entries
      .filter((entry) => !entry.result.ok)
      .flatMap((entry) => [
        `- replay ${entry.filePath}`,
        ...entry.result.errors.map((error) => `  error=${error}`),
      ]),
    ...result.validationAfter.entries
      .filter((entry) => !entry.ok)
      .flatMap((entry) => [`- output ${entry.filePath}`, `  error=${entry.error ?? ""}`]),
  ].filter(Boolean) as string[];
}

export function formatAgentCheckJson(result: AgentCheckResult): AgentCheckJsonSummary {
  const replayFailures = result.replay.entries.filter((entry) => !entry.result.ok);
  return normalizeAgentCheckJsonSummary({
    $schema: AGENT_CHECK_SCHEMA_URL,
    version: 1,
    ok: result.ok,
    cassetteDir: result.cassetteDir,
    artifactsRoot: result.artifactsRoot,
    summaryPath: result.summaryPath,
    commands: {
      check: {
        argv: [
          "ptywright",
          "agent",
          "check",
          result.cassetteDir,
          "--artifacts-root",
          result.artifactsRoot,
        ],
      },
      updateSnapshots: {
        argv: [
          "ptywright",
          "agent",
          "check",
          result.cassetteDir,
          "--artifacts-root",
          result.artifactsRoot,
          "--update-snapshots",
        ],
      },
      rerun: {
        argv: ["ptywright", "agent", "rerun", result.summaryPath],
      },
    },
    inputs: {
      totalCount: result.validationBefore.totalCount,
      failureCount: result.validationBefore.failureCount,
    },
    replay: {
      ok: result.replay.ok,
      totalCount: result.replay.entries.length,
      failureCount: replayFailures.length,
      reportPath: result.replay.reportPath,
      summaryPath: result.replay.summaryPath,
    },
    outputs: {
      totalCount: result.validationAfter.totalCount,
      failureCount: result.validationAfter.failureCount,
    },
    failures: [
      ...result.validationBefore.entries
        .filter((entry) => !entry.ok)
        .map((entry) => ({
          stage: "input" as const,
          filePath: entry.filePath,
          kind: entry.kind,
          errors: entry.error ? [entry.error] : [],
        })),
      ...replayFailures.map((entry) => ({
        stage: "replay" as const,
        filePath: entry.filePath,
        errors: entry.result.errors,
      })),
      ...result.validationAfter.entries
        .filter((entry) => !entry.ok)
        .map((entry) => ({
          stage: "output" as const,
          filePath: entry.filePath,
          kind: entry.kind,
          errors: entry.error ? [entry.error] : [],
        })),
    ],
  });
}
