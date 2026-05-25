import { join } from "node:path";

import {
  AGENT_CHECK_SCHEMA_URL,
  normalizeAgentCheckJsonSummary,
  writeAgentCheckSummaryPath,
  type AgentCheckJsonSummary,
} from "./check_summary";
import { agentManifestPath, writeAgentManifestPath } from "./manifest";
import { replayAllAgentRecords } from "./replay_all";
import { validateAgentArtifactsPath } from "./validate";

export type AgentCheckOptions = {
  cassetteDir?: string;
  artifactsRoot?: string;
  updateSnapshots?: boolean;
  headless?: boolean;
  json?: boolean;
};

export type AgentCheckResult = {
  ok: boolean;
  cassetteDir: string;
  artifactsRoot: string;
  summaryPath: string;
  validationBefore: Awaited<ReturnType<typeof validateAgentArtifactsPath>>;
  replay: Awaited<ReturnType<typeof replayAllAgentRecords>>;
  validationAfter: Awaited<ReturnType<typeof validateAgentArtifactsPath>>;
};

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
  writeAgentCheckSummaryPath(finalResult.summaryPath, formatAgentCheckJson(finalResult));
  writeCheckManifest(finalResult);
  return finalResult;
}

function writeCheckManifest(result: AgentCheckResult): void {
  const summary = formatAgentCheckJson(result);
  writeAgentManifestPath(agentManifestPath(result.artifactsRoot), {
    kind: "check",
    ok: result.ok,
    rootDir: result.artifactsRoot,
    primaryPath: result.summaryPath,
    commands: summary.commands,
    validation: {
      ok: result.validationBefore.ok && result.replay.ok && result.validationAfter.ok,
      stages: [
        {
          name: "inputs",
          ok: result.validationBefore.ok,
          totalCount: result.validationBefore.totalCount,
          failureCount: result.validationBefore.failureCount,
        },
        {
          name: "replay",
          ok: result.replay.ok,
          totalCount: result.replay.entries.length,
          failureCount: result.replay.entries.filter((entry) => !entry.result.ok).length,
        },
        {
          name: "outputs",
          ok: result.validationAfter.ok,
          totalCount: result.validationAfter.totalCount,
          failureCount: result.validationAfter.failureCount,
        },
      ],
    },
    files: [
      { path: result.summaryPath, kind: "check-summary", role: "summary", ok: result.ok },
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
