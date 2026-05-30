import { isAbsolute, resolve } from "node:path";

import { checkAgentRegression } from "../agent/check";
import { promoteAgentCassette } from "../agent/promote";
import { recordAgentSpecPath } from "../agent/recorder";
import { replayAllAgentRecords } from "../agent/replay_all";
import { rerunAgentSummary } from "../agent/rerun";
import { replayAgentRecordPath, runAgentSpecPath } from "../agent/runner";
import type { ResolvedPtywrightConfig } from "../config";
import type { AgentCliArgs } from "./agent_args";
import {
  printAgentCheckResult,
  printAgentPromoteResult,
  printAgentRecordResult,
  printAgentReplayAllResult,
  printAgentRerunResult,
  printAgentRunResult,
} from "./agent_execution_output";

type AgentExecutionCommandContext = {
  config?: ResolvedPtywrightConfig;
  headless: boolean;
};

export async function runAgentExecutionCommand(
  args: AgentCliArgs,
  context: AgentExecutionCommandContext,
): Promise<number> {
  if (args.mode === "record") {
    return await runAgentRecord(args, context);
  }

  if (args.mode === "check") {
    return await runAgentCheck(args, context);
  }

  if (args.mode === "promote") {
    return await runAgentPromote(args, context);
  }

  if (args.mode === "rerun") {
    return await runAgentRerun(args, context);
  }

  if (args.mode === "replay-all") {
    return await runAgentReplayAll(args, context);
  }

  return await runAgentRunOrReplay(args, context);
}

async function runAgentRecord(
  args: AgentCliArgs,
  context: AgentExecutionCommandContext,
): Promise<number> {
  const result = await recordAgentSpecPath(args.path!, {
    outPath: args.outPath!,
    durationMs: args.durationMs,
    headless: context.headless,
    config: context.config,
  });
  return printAgentRecordResult(result);
}

async function runAgentCheck(
  args: AgentCliArgs,
  context: AgentExecutionCommandContext,
): Promise<number> {
  const result = await checkAgentRegression({
    config: context.config,
    cassetteDir:
      args.path ??
      args.cassetteDir ??
      resolveAgentConfigPath(context.config, context.config?.agent?.cassetteDir),
    artifactsRoot:
      args.artifactsRoot ??
      resolveAgentConfigPath(context.config, context.config?.agent?.artifactsRoot),
    headless: context.headless,
    updateSnapshots: args.updateSnapshots,
  });
  return printAgentCheckResult(result, args.json);
}

async function runAgentPromote(
  args: AgentCliArgs,
  context: AgentExecutionCommandContext,
): Promise<number> {
  const result = await promoteAgentCassette({
    sourcePath: args.path!,
    cassetteDir:
      args.cassetteDir ??
      resolveAgentConfigPath(context.config, context.config?.agent?.cassetteDir),
    snapshotDir: args.snapshotDir,
    snapshotRoot: args.snapshotDir
      ? undefined
      : resolveAgentConfigPath(context.config, context.config?.agent?.snapshotDir),
    artifactsRoot:
      args.artifactsRoot ??
      resolveAgentConfigPath(context.config, context.config?.agent?.artifactsRoot),
    headless: context.headless,
    updateSnapshots: args.updateSnapshots,
  });
  return printAgentPromoteResult(result, args.json);
}

async function runAgentRerun(
  args: AgentCliArgs,
  context: AgentExecutionCommandContext,
): Promise<number> {
  const rerun = await rerunAgentSummary({
    path: args.path!,
    artifactsRoot:
      args.artifactsRoot ??
      resolveAgentConfigPath(context.config, context.config?.agent?.artifactsRoot),
    headless: context.headless,
    updateSnapshots: args.updateSnapshots,
  });

  return printAgentRerunResult(rerun, args.json);
}

async function runAgentReplayAll(
  args: AgentCliArgs,
  context: AgentExecutionCommandContext,
): Promise<number> {
  const result = await replayAllAgentRecords({
    config: context.config,
    dir: args.path ?? resolveAgentConfigPath(context.config, context.config?.agent?.cassetteDir),
    artifactsRoot:
      args.artifactsRoot ??
      resolveAgentConfigPath(context.config, context.config?.agent?.artifactsRoot),
    headless: context.headless,
    updateSnapshots: args.updateSnapshots,
  });
  return printAgentReplayAllResult(result, args.json);
}

async function runAgentRunOrReplay(
  args: AgentCliArgs,
  context: AgentExecutionCommandContext,
): Promise<number> {
  const options = {
    artifactsDir: resolveCliPath(args.artifactsDir),
    updateSnapshots: args.updateSnapshots,
    headless: context.headless,
    config: context.config,
  };
  const result =
    args.mode === "run"
      ? await runAgentSpecPath(args.path!, options)
      : await replayAgentRecordPath(args.path!, options);

  return printAgentRunResult(result, args.json);
}

function resolveAgentConfigPath(
  config: ResolvedPtywrightConfig | undefined,
  path: string | undefined,
): string | undefined {
  if (!path) return undefined;
  if (isAbsolute(path)) return path;
  return resolve(config?.rootDir ?? process.cwd(), path);
}

function resolveCliPath(path: string | undefined): string | undefined {
  if (!path) return undefined;
  return isAbsolute(path) ? path : resolve(process.cwd(), path);
}
