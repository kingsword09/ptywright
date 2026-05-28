import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import type { AgentReplaySummary } from "./summary";
import {
  AGENT_REPLAY_SUMMARY_SCHEMA_URL,
  normalizeAgentReplaySummary,
  writeAgentReplaySummaryPath,
} from "./summary";
import type { AgentReplayAllResult } from "./replay_all_types";

export function formatAgentReplaySummary(result: AgentReplayAllResult): AgentReplaySummary {
  const entries = result.entries.map((entry) => ({
    filePath: entry.filePath,
    durationMs: entry.durationMs,
    ok: entry.result.ok,
    mode: entry.result.mode,
    frames: entry.result.cassetteFrameCount,
    reportPath: entry.result.reportPath,
    recordPath: entry.result.recordPath,
    cassettePath: entry.result.replaySourceCassettePath ?? entry.result.cassettePath,
    failedArtifacts: entry.result.artifacts
      .filter((artifact) => !artifact.ok)
      .map((artifact) => ({
        name: artifact.name,
        viewport: artifact.viewport,
        kind: artifact.kind,
        path: artifact.path,
        baselinePath: artifact.baselinePath,
        diffPath: artifact.diffPath,
        error: artifact.error,
      })),
    errors: entry.result.errors,
  }));
  const failureCount = entries.filter((entry) => !entry.ok).length;
  return normalizeAgentReplaySummary({
    $schema: AGENT_REPLAY_SUMMARY_SCHEMA_URL,
    version: 1,
    ok: result.ok,
    dir: result.dir,
    suiteDir: result.suiteDir,
    durationMs: result.durationMs,
    reportPath: result.reportPath,
    summaryPath: result.summaryPath,
    commands: {
      replayAll: {
        argv: ["ptywright", "agent", "replay-all", result.dir, "--artifacts-root", result.suiteDir],
      },
      updateSnapshots: {
        argv: [
          "ptywright",
          "agent",
          "replay-all",
          result.dir,
          "--artifacts-root",
          result.suiteDir,
          "--update-snapshots",
        ],
      },
      rerun: {
        argv: ["ptywright", "agent", "rerun", result.summaryPath],
      },
    },
    updateSnapshots: result.updateSnapshots,
    totalCount: entries.length,
    failureCount,
    entries,
  });
}

export function writeReplayAllSummary(path: string, result: AgentReplayAllResult): void {
  mkdirSync(dirname(path), { recursive: true });
  writeAgentReplaySummaryPath(path, formatAgentReplaySummary(result));
}
