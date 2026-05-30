import { join, relative, resolve } from "node:path";

import { replayRecordEntry } from "./replay_all_entry";
import { writeReplayAllManifest } from "./replay_all_manifest";
import { writeReplayAllReport } from "./replay_all_report";
import { writeReplayAllSummary } from "./replay_all_summary";
import type {
  AgentReplayAllEntry,
  AgentReplayAllOptions,
  AgentReplayAllResult,
} from "./replay_all_types";
import { listAgentReplayFiles, safeArtifactsDirName } from "./replay_files";

export { listAgentReplayFiles } from "./replay_files";
export { formatAgentReplaySummary } from "./replay_all_summary";
export type {
  AgentReplayAllEntry,
  AgentReplayAllOptions,
  AgentReplayAllResult,
} from "./replay_all_types";

export async function replayAllAgentRecords(
  options: AgentReplayAllOptions = {},
): Promise<AgentReplayAllResult> {
  const dir = resolve(options.dir?.trim() ? options.dir.trim() : join(".tmp", "agent"));
  const suiteDir = resolve(
    options.artifactsRoot?.trim() ? options.artifactsRoot.trim() : join(".tmp", "agent-replay-all"),
  );
  const filePaths = listAgentReplayFiles(dir, { artifactsRoot: suiteDir });
  const entries: AgentReplayAllEntry[] = [];
  const startedAt = Date.now();
  const updateSnapshots = options.updateSnapshots ?? false;

  for (const filePath of filePaths) {
    const artifactsDir = join(suiteDir, "tests", safeArtifactsDirName(relative(dir, filePath)));
    const entryStartedAt = Date.now();
    const result = await replayRecordEntry(filePath, artifactsDir, {
      config: options.config,
      headless: options.headless ?? true,
      updateSnapshots,
    });
    entries.push({
      filePath,
      durationMs: Date.now() - entryStartedAt,
      result,
    });
  }

  const durationMs = Date.now() - startedAt;
  const reportPath = join(suiteDir, "index.html");
  const summaryPath = join(suiteDir, "agent-replay.summary.json");

  writeReplayAllSummary(summaryPath, {
    ok: entries.every((entry) => entry.result.ok),
    dir,
    suiteDir,
    durationMs,
    reportPath,
    summaryPath,
    updateSnapshots,
    entries,
  });
  writeReplayAllReport(reportPath, {
    dir,
    durationMs,
    updateSnapshots,
    entries,
    summaryPath,
  });
  writeReplayAllManifest({
    ok: entries.every((entry) => entry.result.ok),
    dir,
    suiteDir,
    reportPath,
    summaryPath,
    updateSnapshots,
    entries,
  });

  return {
    ok: entries.every((entry) => entry.result.ok),
    dir,
    suiteDir,
    durationMs,
    reportPath,
    summaryPath,
    updateSnapshots,
    entries,
  };
}
