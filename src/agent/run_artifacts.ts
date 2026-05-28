import { writeFileSync } from "node:fs";
import { dirname, relative } from "node:path";

import { agentManifestPath, writeAgentManifestPath } from "./manifest";
import {
  AGENT_RUN_RECORD_SCHEMA_URL,
  writeAgentRunRecordPath,
  type AgentRunRecord,
} from "./run_record";
import type { AgentFlowSpec } from "./schema";
import type { AgentRunResult } from "./runner_types";

export function writeRunRecord(result: AgentRunResult, spec: AgentFlowSpec): void {
  const record: AgentRunRecord = {
    $schema: AGENT_RUN_RECORD_SCHEMA_URL,
    version: 1,
    name: result.name,
    ok: result.ok,
    startedAt: new Date(result.startedAt).toISOString(),
    durationMs: result.durationMs,
    mode: result.mode,
    spec,
    flowPath: relative(dirname(result.recordPath), result.flowPath),
    artifactsDir: result.artifactsDir,
    snapshotDir: result.snapshotDir,
    reportPath: result.reportPath,
    cassettePath: relative(dirname(result.recordPath), result.cassettePath),
    cassetteFrameCount: result.cassetteFrameCount,
    replayCommand: result.replayCommand,
    commands: result.commands,
    steps: result.steps,
    artifacts: result.artifacts,
    errors: result.errors,
  };

  writeAgentRunRecordPath(result.recordPath, record);
}

export function writeRunManifest(result: AgentRunResult): void {
  writeAgentManifestPath(agentManifestPath(result.artifactsDir), {
    kind: "run",
    ok: result.ok,
    rootDir: result.artifactsDir,
    primaryPath: result.recordPath,
    commands: result.commands,
    validation: {
      ok: result.ok,
      stages: [
        {
          name: "run",
          ok: result.ok,
          totalCount: result.artifacts.length,
          failureCount: result.artifacts.filter((artifact) => !artifact.ok).length,
        },
      ],
    },
    files: [
      { path: result.flowPath, kind: "flow", role: "flow" },
      { path: result.cassettePath, kind: "cassette", role: "cassette" },
      { path: result.recordPath, kind: "run-record", role: "record", ok: result.ok },
      { path: result.reportPath, kind: "report", role: "report", ok: result.ok },
      ...result.artifacts.flatMap((artifact) => [
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
    ],
  });
}

export function writeFlowArtifact(path: string, spec: AgentFlowSpec): void {
  writeFileSync(path, JSON.stringify(spec, null, 2) + "\n", "utf8");
}
