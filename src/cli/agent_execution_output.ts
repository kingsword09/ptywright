import { formatAgentCheckJson, formatAgentCheckLines, type AgentCheckResult } from "../agent/check";
import {
  formatAgentPromoteLines,
  formatAgentPromoteSummary,
  type AgentPromoteResult,
} from "../agent/promote";
import { formatAgentReplaySummary, type AgentReplayAllResult } from "../agent/replay_all";
import type { AgentRecordResult } from "../agent/recorder";
import type { AgentRerunResult } from "../agent/rerun";
import { readAgentRunRecordPath } from "../agent/run_record";
import type { AgentRunResult } from "../agent/runner";
import { logLines } from "./common";

export function printAgentRecordResult(result: AgentRecordResult): number {
  logLines(
    [
      `${result.ok ? "ok" : "failed"} record=${result.outPath}`,
      `steps=${result.stepCount}`,
      result.url ? `url=${result.url}` : null,
      result.error ? `error=${result.error}` : null,
    ],
    !result.ok,
  );
  return result.ok ? 0 : 1;
}

export function printAgentCheckResult(result: AgentCheckResult, json: boolean): number {
  if (json) {
    logLines([JSON.stringify(formatAgentCheckJson(result), null, 2)], false);
  } else {
    logLines(formatAgentCheckLines(result), !result.ok);
  }
  return result.ok ? 0 : 1;
}

export function printAgentPromoteResult(result: AgentPromoteResult, json: boolean): number {
  if (json) {
    logLines([JSON.stringify(formatAgentPromoteSummary(result), null, 2)], false);
  } else {
    logLines(formatAgentPromoteLines(result), !result.ok);
  }
  return result.ok ? 0 : 1;
}

export function printAgentRerunResult(rerun: AgentRerunResult, json: boolean): number {
  if (rerun.kind === "check-summary") {
    return printAgentCheckResult(rerun.result, json);
  }

  if (rerun.kind === "promote-summary") {
    return printAgentPromoteResult(rerun.result, json);
  }

  const failures = rerun.result.entries.filter((entry) => !entry.result.ok);
  if (json) {
    logLines([JSON.stringify(formatAgentReplaySummary(rerun.result), null, 2)], false);
    return failures.length === 0 ? 0 : 1;
  }

  logLines(
    [
      `${failures.length === 0 ? "ok" : "failed"} rerun=${rerun.kind}`,
      `count=${rerun.result.entries.length}`,
      `dir=${rerun.result.dir}`,
      `report=${rerun.result.reportPath}`,
      `summary=${rerun.result.summaryPath}`,
      ...failures.flatMap((entry) => [
        `- ${entry.filePath}`,
        ...entry.result.errors.map((error) => `  error=${error}`),
      ]),
    ],
    failures.length > 0,
  );
  return failures.length === 0 ? 0 : 1;
}

export function printAgentReplayAllResult(result: AgentReplayAllResult, json: boolean): number {
  const failures = result.entries.filter((entry) => !entry.result.ok);
  if (json) {
    logLines([JSON.stringify(formatAgentReplaySummary(result), null, 2)], false);
    return failures.length === 0 ? 0 : 1;
  }

  if (failures.length === 0) {
    logLines(
      [
        `ok count=${result.entries.length} dir=${result.dir}`,
        `report=${result.reportPath}`,
        `summary=${result.summaryPath}`,
      ],
      false,
    );
    return 0;
  }

  logLines(
    [
      `failed count=${failures.length}/${result.entries.length} dir=${result.dir}`,
      `report=${result.reportPath}`,
      `summary=${result.summaryPath}`,
      ...failures.flatMap((entry) => [
        `- ${entry.filePath}`,
        ...entry.result.errors.map((error) => `  error=${error}`),
      ]),
    ],
    true,
  );
  return 1;
}

export function printAgentRunResult(result: AgentRunResult, json: boolean): number {
  if (json) {
    logLines([JSON.stringify(readAgentRunRecordPath(result.recordPath), null, 2)], false);
    return result.ok ? 0 : 1;
  }

  logLines(
    [
      `${result.ok ? "ok" : "failed"} agent=${result.name}`,
      `report=${result.reportPath}`,
      `record=${result.recordPath}`,
      `flow=${result.flowPath}`,
      `cassette=${result.cassettePath}`,
      `snapshots=${result.snapshotDir}`,
      `mode=${result.mode}`,
      `frames=${result.cassetteFrameCount}`,
      result.replayCommand ? `replay=${result.replayCommand}` : null,
      ...result.errors.map((error) => `error=${error}`),
    ],
    !result.ok,
  );

  return result.ok ? 0 : 1;
}
