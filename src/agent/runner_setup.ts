import { mkdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { envTruthy } from "../common/env";
import { createAgentCassette, type AgentCassette } from "./cassette";
import { normalizeAgentFlowSpecWithConfig } from "./config_defaults";
import { formatAgentLaunchCommand } from "./launch";
import { sanitizeArtifactName } from "./normalize";
import { resolveAgentFlavor } from "./presets";
import { formatAgentArgv } from "./run_record";
import type { AgentRunnerOptions, AgentRunResult } from "./runner_types";
import { normalizeAgentFlowSpec, type AgentFlowSpec } from "./schema";

export type AgentRunSetup = {
  startedAt: number;
  rootDir: string;
  spec: AgentFlowSpec;
  name: string;
  artifactsDir: string;
  snapshotDir: string;
  reportPath: string;
  recordPath: string;
  flowPath: string;
  cassettePath: string;
  updateSnapshots: boolean;
  cassette: AgentCassette;
  result: AgentRunResult;
};

export function prepareAgentRun(input: unknown, options: AgentRunnerOptions): AgentRunSetup {
  const startedAt = Date.now();
  const rootDir = options.rootDir ? resolve(process.cwd(), options.rootDir) : process.cwd();
  const spec = normalizeAgentFlowSpecWithConfig(
    input,
    options.replayCassette ? undefined : options.config,
  );
  const name = sanitizeArtifactName(spec.name ?? "agent-flow");
  const artifactsDir = resolve(
    rootDir,
    options.artifactsDir ?? spec.artifactsDir ?? join(".tmp", "agent", name),
  );
  const snapshotDir = resolve(rootDir, spec.snapshotDir ?? join("snapshots", name));
  const reportPath = join(artifactsDir, "index.html");
  const recordPath = join(artifactsDir, `${name}.agent-run.json`);
  const flowPath = join(artifactsDir, `${name}.flow.json`);
  const cassettePath = join(artifactsDir, `${name}.cassette.json`);
  const updateSnapshots = options.updateSnapshots ?? envTruthy(process.env.UPDATE_SNAPSHOTS);
  const cassette = options.replayCassette ?? createAgentCassette(name, spec);

  mkdirSync(artifactsDir, { recursive: true });
  mkdirSync(snapshotDir, { recursive: true });

  const replayArgv = ["ptywright", "agent", "replay", relative(process.cwd(), recordPath)];
  const result: AgentRunResult = {
    ok: true,
    name,
    mode: options.replayCassette ? "replay" : "live",
    startedAt,
    durationMs: 0,
    artifactsDir,
    snapshotDir,
    reportPath,
    recordPath,
    flowPath,
    cassettePath,
    replaySourceCassettePath: options.replaySourceCassettePath,
    replayCommand: formatAgentArgv(replayArgv),
    commands: {
      replay: { argv: replayArgv },
      updateSnapshots: { argv: [...replayArgv, "--update-snapshots"] },
    },
    agentFlavor: resolveAgentFlavor(spec),
    viewports: spec.viewports ?? [],
    cassetteFrameCount: cassette.frames.length,
    steps: [],
    artifacts: [],
    errors: [],
  };

  return {
    startedAt,
    rootDir,
    spec,
    name,
    artifactsDir,
    snapshotDir,
    reportPath,
    recordPath,
    flowPath,
    cassettePath,
    updateSnapshots,
    cassette,
    result,
  };
}

export function formatAgentLaunchPlan(input: unknown): string {
  const spec = normalizeAgentFlowSpec(input);
  return formatAgentLaunchCommand(spec.launch);
}
