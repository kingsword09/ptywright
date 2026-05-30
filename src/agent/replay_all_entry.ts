import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { renderFailedEntryReport } from "./replay_all_report";
import { safeArtifactsDirName } from "./replay_files";
import {
  AGENT_RUN_RECORD_SCHEMA_URL,
  formatAgentArgv,
  writeAgentRunRecordPath,
} from "./run_record";
import {
  replayAgentRecordPath,
  type AgentRecordedStep,
  type AgentRunArtifact,
  type AgentRunResult,
} from "./runner";
import type { ResolvedPtywrightConfig } from "../config";

export async function replayRecordEntry(
  filePath: string,
  artifactsDir: string,
  options: { config?: ResolvedPtywrightConfig; headless: boolean; updateSnapshots: boolean },
): Promise<AgentRunResult> {
  try {
    return await replayAgentRecordPath(filePath, {
      artifactsDir,
      config: options.config,
      headless: options.headless,
      updateSnapshots: options.updateSnapshots,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const result = createFailedReplayResult(filePath, artifactsDir, message);
    writeFailedReplayResult(result);
    return result;
  }
}

function createFailedReplayResult(
  filePath: string,
  artifactsDir: string,
  message: string,
): AgentRunResult {
  const startedAt = Date.now();
  const replayArgv = ["ptywright", "agent", "replay", filePath];
  return {
    ok: false,
    name: safeArtifactsDirName(filePath),
    mode: "replay",
    agentFlavor: "generic",
    startedAt,
    durationMs: 0,
    artifactsDir,
    snapshotDir: join(artifactsDir, "snapshots"),
    reportPath: join(artifactsDir, "index.html"),
    recordPath: join(artifactsDir, "failed.agent-run.json"),
    flowPath: "",
    cassettePath: filePath,
    replayCommand: formatAgentArgv(replayArgv),
    commands: {
      replay: { argv: replayArgv },
      updateSnapshots: { argv: [...replayArgv, "--update-snapshots"] },
    },
    viewports: [],
    cassetteFrameCount: 0,
    steps: [] as AgentRecordedStep[],
    artifacts: [] as AgentRunArtifact[],
    errors: [message],
  };
}

function writeFailedReplayResult(result: AgentRunResult): void {
  mkdirSync(result.artifactsDir, { recursive: true });
  writeAgentRunRecordPath(result.recordPath, {
    $schema: AGENT_RUN_RECORD_SCHEMA_URL,
    version: 1,
    name: result.name,
    ok: result.ok,
    startedAt: new Date(result.startedAt).toISOString(),
    durationMs: result.durationMs,
    mode: result.mode,
    artifactsDir: result.artifactsDir,
    snapshotDir: result.snapshotDir,
    reportPath: result.reportPath,
    cassettePath: result.cassettePath,
    cassetteFrameCount: result.cassetteFrameCount,
    replayCommand: result.replayCommand,
    commands: result.commands,
    steps: result.steps,
    artifacts: result.artifacts,
    errors: result.errors,
  });
  writeFileSync(result.reportPath, renderFailedEntryReport(result), "utf8");
}
