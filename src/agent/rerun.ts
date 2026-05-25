import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";

import { checkAgentRegression, type AgentCheckResult } from "./check";
import { readAgentCheckSummaryPath } from "./check_summary";
import { findMovedPrimaryManifestBundle } from "./commands";
import { promoteAgentCassette, type AgentPromoteResult } from "./promote";
import { readAgentPromoteSummaryPath } from "./promote_summary";
import { replayAllAgentRecords, type AgentReplayAllResult } from "./replay_all";
import { readAgentReplaySummaryPath } from "./summary";

export type AgentRerunOptions = {
  path: string;
  artifactsRoot?: string;
  updateSnapshots?: boolean;
  headless?: boolean;
};

export type AgentRerunResult =
  | {
      kind: "check-summary";
      result: AgentCheckResult;
    }
  | {
      kind: "promote-summary";
      result: AgentPromoteResult;
    }
  | {
      kind: "replay-summary";
      result: AgentReplayAllResult;
    };

export async function rerunAgentSummary(options: AgentRerunOptions): Promise<AgentRerunResult> {
  const path = resolve(process.cwd(), options.path);
  const kind = inferSummaryKind(path);

  if (kind === "check-summary") {
    const summary = readAgentCheckSummaryPath(path);
    const movedBundle = findMovedPrimaryManifestBundle(path, "check-summary");
    return {
      kind,
      result: await checkAgentRegression({
        cassetteDir: movedBundle?.replayInputDir ?? summary.cassetteDir,
        artifactsRoot: options.artifactsRoot ?? movedBundle?.artifactsRoot ?? summary.artifactsRoot,
        headless: options.headless ?? true,
        updateSnapshots: options.updateSnapshots ?? false,
      }),
    };
  }

  if (kind === "promote-summary") {
    const summary = readAgentPromoteSummaryPath(path);
    const movedBundle = findMovedPrimaryManifestBundle(path, "promote-summary");
    return {
      kind,
      result: await promoteAgentCassette({
        sourcePath: summary.sourcePath,
        cassetteDir: summary.cassetteDir,
        snapshotDir: summary.snapshotDir,
        artifactsRoot: options.artifactsRoot ?? movedBundle?.artifactsRoot ?? summary.artifactsRoot,
        headless: options.headless ?? true,
        updateSnapshots: options.updateSnapshots ?? summary.updateSnapshots,
      }),
    };
  }

  if (kind === "replay-summary") {
    const summary = readAgentReplaySummaryPath(path);
    const movedReplayBundle = findMovedPrimaryManifestBundle(path, "replay-summary");
    return {
      kind,
      result: await replayAllAgentRecords({
        dir: movedReplayBundle?.replayInputDir ?? summary.dir,
        artifactsRoot:
          options.artifactsRoot ?? movedReplayBundle?.artifactsRoot ?? summary.suiteDir,
        headless: options.headless ?? true,
        updateSnapshots: options.updateSnapshots ?? false,
      }),
    };
  }

  throw new Error(`unsupported agent summary: ${options.path}`);
}

function inferSummaryKind(path: string): AgentRerunResult["kind"] | null {
  const name = basename(path);
  if (name === "agent-check.summary.json") return "check-summary";
  if (name === "agent-promote.summary.json") return "promote-summary";
  if (name === "agent-replay.summary.json") return "replay-summary";

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch {
    return null;
  }

  if (isCheckSummaryLike(parsed)) return "check-summary";
  if (isPromoteSummaryLike(parsed)) return "promote-summary";
  if (isReplaySummaryLike(parsed)) return "replay-summary";
  return null;
}

function isPromoteSummaryLike(input: unknown): boolean {
  return (
    typeof input === "object" &&
    input !== null &&
    "targetCassettePath" in input &&
    "validation" in input &&
    "replay" in input &&
    Array.isArray((input as { failures?: unknown }).failures)
  );
}

function isCheckSummaryLike(input: unknown): boolean {
  return (
    typeof input === "object" &&
    input !== null &&
    "inputs" in input &&
    "outputs" in input &&
    "replay" in input &&
    Array.isArray((input as { failures?: unknown }).failures)
  );
}

function isReplaySummaryLike(input: unknown): boolean {
  return (
    typeof input === "object" &&
    input !== null &&
    Array.isArray((input as { entries?: unknown }).entries) &&
    "totalCount" in input &&
    "failureCount" in input
  );
}
