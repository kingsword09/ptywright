import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { readAgentCassettePath } from "./cassette";
import { readAgentRunRecordPath } from "./run_record";
import { replayAllAgentRecords } from "./replay_all";
import {
  AGENT_PROMOTE_SCHEMA_URL,
  normalizeAgentPromoteSummary,
  writeAgentPromoteSummaryPath,
  type AgentPromoteSummary,
} from "./promote_summary";
import { agentManifestPath, writeAgentManifestPath } from "./manifest";
import { sanitizeArtifactName } from "./normalize";
import { validateAgentArtifactsPath } from "./validate";

export type AgentPromoteOptions = {
  sourcePath: string;
  cassetteDir?: string;
  snapshotDir?: string;
  snapshotRoot?: string;
  artifactsRoot?: string;
  updateSnapshots?: boolean;
  headless?: boolean;
};

export type AgentPromoteResult = {
  ok: boolean;
  sourcePath: string;
  cassetteDir: string;
  targetDir: string;
  targetCassettePath: string;
  snapshotDir: string;
  artifactsRoot: string;
  summaryPath: string;
  updateSnapshots: boolean;
  validation: Awaited<ReturnType<typeof validateAgentArtifactsPath>>;
  replay: Awaited<ReturnType<typeof replayAllAgentRecords>>;
};

export async function promoteAgentCassette(
  options: AgentPromoteOptions,
): Promise<AgentPromoteResult> {
  const sourcePath = resolve(process.cwd(), options.sourcePath);
  const sourceCassettePath = resolveSourceCassettePath(sourcePath);
  const sourceCassette = readAgentCassettePath(sourceCassettePath);
  const name = sanitizeArtifactName(sourceCassette.name);
  const cassetteDir = options.cassetteDir ?? "tests/agent-cassettes";
  const snapshotDir =
    options.snapshotDir ?? join(options.snapshotRoot ?? "tests/agent-snapshots", name);
  const artifactsRoot = options.artifactsRoot ?? join(".tmp", "agent-promote", name);
  const targetDir = join(cassetteDir, name);
  const targetCassettePath = join(targetDir, `${name}.cassette.json`);
  const summaryPath = join(artifactsRoot, "agent-promote.summary.json");
  const updateSnapshots = options.updateSnapshots ?? false;

  mkdirSync(targetDir, { recursive: true });
  mkdirSync(artifactsRoot, { recursive: true });

  const promotedCassette = {
    ...sourceCassette,
    spec: {
      ...sourceCassette.spec,
      snapshotDir,
    },
  };
  writeFileSync(targetCassettePath, JSON.stringify(promotedCassette, null, 2) + "\n", "utf8");

  const validation = await validateAgentArtifactsPath(targetCassettePath);
  let replay = emptyReplayResult(targetDir, artifactsRoot, updateSnapshots);
  if (validation.ok) {
    replay = await replayAllAgentRecords({
      dir: targetDir,
      artifactsRoot,
      headless: options.headless ?? true,
      updateSnapshots,
    });
  }

  const result = {
    ok: validation.ok && replay.ok,
    sourcePath: options.sourcePath,
    cassetteDir,
    targetDir,
    targetCassettePath,
    snapshotDir,
    artifactsRoot,
    summaryPath,
    updateSnapshots,
    validation,
    replay,
  };
  writeAgentPromoteSummaryPath(summaryPath, formatAgentPromoteSummary(result));
  writePromoteManifest(result);
  return result;
}

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
    commands: {
      promote: {
        argv: [
          "ptywright",
          "agent",
          "promote",
          result.sourcePath,
          "--cassette-dir",
          result.cassetteDir,
          "--snapshot-dir",
          result.snapshotDir,
          "--artifacts-root",
          result.artifactsRoot,
          ...(result.updateSnapshots ? ["--update-snapshots"] : []),
        ],
      },
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
  return [
    `${result.ok ? "ok" : "failed"} agent-promote`,
    `source=${result.sourcePath}`,
    `cassette=${result.targetCassettePath}`,
    `snapshots=${result.snapshotDir}`,
    `summary=${result.summaryPath}`,
    result.replay.reportPath ? `report=${result.replay.reportPath}` : null,
    `validation=${result.validation.failureCount}/${result.validation.totalCount}`,
    `replay=${result.replay.entries.filter((entry) => !entry.result.ok).length}/${result.replay.entries.length}`,
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

function writePromoteManifest(result: AgentPromoteResult): void {
  const summary = formatAgentPromoteSummary(result);
  writeAgentManifestPath(agentManifestPath(result.artifactsRoot), {
    kind: "promote",
    ok: result.ok,
    rootDir: result.artifactsRoot,
    primaryPath: result.summaryPath,
    commands: summary.commands,
    validation: {
      ok: result.validation.ok && result.replay.ok,
      stages: [
        {
          name: "validation",
          ok: result.validation.ok,
          totalCount: result.validation.totalCount,
          failureCount: result.validation.failureCount,
        },
        {
          name: "replay",
          ok: result.replay.ok,
          totalCount: result.replay.entries.length,
          failureCount: result.replay.entries.filter((entry) => !entry.result.ok).length,
        },
      ],
    },
    files: [
      { path: result.summaryPath, kind: "promote-summary", role: "summary", ok: result.ok },
      { path: result.targetCassettePath, kind: "cassette", role: "promoted-cassette" },
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

function resolveSourceCassettePath(sourcePath: string): string {
  if (sourcePath.endsWith(".cassette.json")) {
    return sourcePath;
  }

  if (sourcePath.endsWith(".agent-run.json")) {
    const record = readAgentRunRecordPath(sourcePath);
    if (!record.cassettePath) {
      throw new Error(`agent run record does not reference a cassette: ${sourcePath}`);
    }
    return resolve(dirname(sourcePath), record.cassettePath);
  }

  throw new Error(`agent promote requires .cassette.json or .agent-run.json: ${sourcePath}`);
}

function emptyReplayResult(
  dir: string,
  suiteDir: string,
  updateSnapshots: boolean,
): Awaited<ReturnType<typeof replayAllAgentRecords>> {
  return {
    ok: false,
    dir,
    suiteDir,
    durationMs: 0,
    reportPath: "",
    summaryPath: "",
    updateSnapshots,
    entries: [],
  };
}
