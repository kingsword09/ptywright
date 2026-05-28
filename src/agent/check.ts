import { join } from "node:path";

import { writeAgentCheckSummaryPath } from "./check_summary";
import { formatAgentCheckJson, formatAgentCheckLines } from "./check_format";
import { writeCheckManifest } from "./check_manifest";
import type { AgentCheckOptions, AgentCheckResult } from "./check_types";
import { replayAllAgentRecords } from "./replay_all";
import { validateAgentArtifactsPath } from "./validate";

export { formatAgentCheckJson, formatAgentCheckLines } from "./check_format";
export type { AgentCheckOptions, AgentCheckResult } from "./check_types";

export async function checkAgentRegression(
  options: AgentCheckOptions = {},
): Promise<AgentCheckResult> {
  const cassetteDir = options.cassetteDir ?? "tests/agent-cassettes";
  const artifactsRoot = options.artifactsRoot ?? ".tmp/agent-check";
  const summaryPath = join(artifactsRoot, "agent-check.summary.json");

  const validationBefore = await validateAgentArtifactsPath(cassetteDir);
  if (!validationBefore.ok) {
    const result = {
      ok: false,
      cassetteDir,
      artifactsRoot,
      summaryPath,
      validationBefore,
      replay: emptyReplayResult(cassetteDir, artifactsRoot),
      validationAfter: emptyValidationResult(artifactsRoot),
    };
    return writeSummaryAndValidateOutputs(result);
  }

  const replay = await replayAllAgentRecords({
    dir: cassetteDir,
    artifactsRoot,
    headless: options.headless ?? true,
    updateSnapshots: options.updateSnapshots ?? false,
  });
  const result = {
    ok: validationBefore.ok && replay.ok,
    cassetteDir,
    artifactsRoot,
    summaryPath,
    validationBefore,
    replay,
    validationAfter: emptyValidationResult(artifactsRoot),
  };
  return writeSummaryAndValidateOutputs(result);
}

function emptyReplayResult(
  dir: string,
  suiteDir: string,
): Awaited<ReturnType<typeof replayAllAgentRecords>> {
  return {
    ok: false,
    dir,
    suiteDir,
    durationMs: 0,
    reportPath: "",
    summaryPath: "",
    updateSnapshots: false,
    entries: [],
  };
}

async function writeSummaryAndValidateOutputs(result: AgentCheckResult): Promise<AgentCheckResult> {
  writeAgentCheckSummaryPath(result.summaryPath, formatAgentCheckJson(result));
  const validationAfter = await validateAgentArtifactsPath(result.artifactsRoot);
  const finalResult = {
    ...result,
    ok: result.validationBefore.ok && result.replay.ok && validationAfter.ok,
    validationAfter,
  };
  const finalSummary = formatAgentCheckJson(finalResult);
  writeAgentCheckSummaryPath(finalResult.summaryPath, finalSummary);
  writeCheckManifest(finalResult, finalSummary);
  return finalResult;
}

function emptyValidationResult(
  path: string,
): Awaited<ReturnType<typeof validateAgentArtifactsPath>> {
  return {
    ok: true,
    path,
    totalCount: 0,
    failureCount: 0,
    entries: [],
  };
}

function parseArgs(argv: string[]): AgentCheckOptions {
  const out: AgentCheckOptions = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === "--dir" && next) {
      out.cassetteDir = next;
      i += 1;
      continue;
    }

    if (arg === "--artifacts-root" && next) {
      out.artifactsRoot = next;
      i += 1;
      continue;
    }

    if (arg === "--update-snapshots") {
      out.updateSnapshots = true;
      continue;
    }

    if (arg === "--headed") {
      out.headless = false;
      continue;
    }

    if (arg === "--json") {
      out.json = true;
      continue;
    }

    throw new Error(`unknown arg: ${arg ?? ""}`);
  }

  return out;
}

function logCheckResult(result: AgentCheckResult): void {
  for (const line of formatAgentCheckLines(result)) {
    // eslint-disable-next-line no-console
    (result.ok ? console.log : console.error)(line);
  }
}

if (import.meta.main) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = await checkAgentRegression(args);
    if (args.json) {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(formatAgentCheckJson(result), null, 2));
    } else {
      logCheckResult(result);
    }
    process.exitCode = result.ok ? 0 : 1;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
