import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";

import { isAgentCassetteLike, readAgentCassettePath } from "./cassette";
import { readAgentCheckSummaryPath } from "./check_summary";
import { AGENT_MANIFEST_FILE_NAME, isAgentManifestLike, readAgentManifestPath } from "./manifest";
import {
  readMovedPrimaryManifest,
  relocateManifestCommands,
  type AgentPrimaryManifestKind,
} from "./manifest_commands";
import { readAgentPromoteSummaryPath } from "./promote_summary";
import { createArtifactCommands, replayCommands, runCommands } from "./command_helpers";
import {
  isAgentFlowLike,
  isCheckSummaryLike,
  isPromoteSummaryLike,
  isReplaySummaryLike,
} from "./command_artifact_predicates";
import type { AgentArtifactCommands } from "./command_types";
import { isAgentRunRecordLike, readAgentRunRecordPath } from "./run_record";
import { loadAgentSpec } from "./spec_loader";
import { readAgentReplaySummaryPath } from "./summary";

export {
  findMovedPrimaryManifestBundle,
  validateAgentManifestCommandTargets,
  type AgentMovedPrimaryManifestBundle,
} from "./manifest_commands";

export {
  formatAgentArtifactCommandLines,
  selectAgentArtifactCommand,
  validateAgentArtifactCommands,
  validateAgentCommandArgv,
} from "./command_helpers";
export type {
  AgentArtifactCommands,
  AgentCommandArtifactKind,
  AgentCommandMap,
  SelectedAgentArtifactCommand,
} from "./command_types";

export async function readAgentArtifactCommandsPath(path: string): Promise<AgentArtifactCommands> {
  const resolved = resolveAgentArtifactCommandsPath(path);
  const name = basename(resolved);

  if (name.endsWith(".agent-run.json")) {
    const bundleCommands = readPrimaryManifestCommands(resolved, "run-record");
    if (bundleCommands) return bundleCommands;

    const record = readAgentRunRecordPath(resolved);
    return createArtifactCommands(resolved, "run-record", record.commands);
  }

  if (name === "agent-replay.summary.json") {
    const bundleCommands = readPrimaryManifestCommands(resolved, "replay-summary");
    if (bundleCommands) return bundleCommands;

    const summary = readAgentReplaySummaryPath(resolved);
    return createArtifactCommands(resolved, "replay-summary", summary.commands);
  }

  if (name === "agent-promote.summary.json") {
    const bundleCommands = readPrimaryManifestCommands(resolved, "promote-summary");
    if (bundleCommands) return bundleCommands;

    const summary = readAgentPromoteSummaryPath(resolved);
    return createArtifactCommands(resolved, "promote-summary", summary.commands);
  }

  if (name === "agent-check.summary.json") {
    const bundleCommands = readPrimaryManifestCommands(resolved, "check-summary");
    if (bundleCommands) return bundleCommands;

    const summary = readAgentCheckSummaryPath(resolved);
    return createArtifactCommands(resolved, "check-summary", summary.commands);
  }

  if (name === AGENT_MANIFEST_FILE_NAME) {
    const manifest = readAgentManifestPath(resolved);
    return createArtifactCommands(
      resolved,
      "manifest",
      relocateManifestCommands(manifest, resolved),
    );
  }

  if (name.endsWith(".cassette.json")) {
    readAgentCassettePath(resolved);
    return createArtifactCommands(resolved, "cassette", replayCommands(path));
  }

  if (name.endsWith(".flow.json") || name.endsWith(".flow.ts")) {
    await loadAgentSpec(resolved);
    return createArtifactCommands(resolved, "flow", runCommands(path));
  }

  return inferJsonCommands(resolved, path);
}

function resolveAgentArtifactCommandsPath(path: string): string {
  const resolved = resolve(process.cwd(), path);
  const stats = statSync(resolved, { throwIfNoEntry: false });
  if (!stats?.isDirectory()) {
    return resolved;
  }

  const manifestPath = join(resolved, AGENT_MANIFEST_FILE_NAME);
  if (existsSync(manifestPath)) {
    return manifestPath;
  }

  throw new Error(
    `agent artifact directory is missing ${AGENT_MANIFEST_FILE_NAME}: ${path}. ` +
      "Pass a supported artifact file, or a manifest bundle directory.",
  );
}

function readPrimaryManifestCommands(
  artifactPath: string,
  kind: AgentPrimaryManifestKind,
): AgentArtifactCommands | null {
  const bundle = readMovedPrimaryManifest(artifactPath, kind);
  if (!bundle) return null;

  return createArtifactCommands(
    artifactPath,
    kind,
    relocateManifestCommands(bundle.manifest, bundle.manifestPath),
    { manifestPath: bundle.manifestPath },
  );
}

async function inferJsonCommands(
  resolved: string,
  originalPath: string,
): Promise<AgentArtifactCommands> {
  const ext = extname(resolved);
  if (ext !== ".json" && ext !== ".ts") {
    throw new Error(`unsupported agent artifact for commands: ${originalPath}`);
  }

  if (ext === ".ts") {
    await loadAgentSpec(resolved);
    return createArtifactCommands(resolved, "flow", runCommands(originalPath));
  }

  const parsed = JSON.parse(readFileSync(resolved, "utf8")) as unknown;
  if (isAgentCassetteLike(parsed)) {
    readAgentCassettePath(resolved);
    return createArtifactCommands(resolved, "cassette", replayCommands(originalPath));
  }

  if (isAgentRunRecordLike(parsed)) {
    const record = readAgentRunRecordPath(resolved);
    return createArtifactCommands(resolved, "run-record", record.commands);
  }

  if (isReplaySummaryLike(parsed)) {
    const summary = readAgentReplaySummaryPath(resolved);
    return createArtifactCommands(resolved, "replay-summary", summary.commands);
  }

  if (isPromoteSummaryLike(parsed)) {
    const summary = readAgentPromoteSummaryPath(resolved);
    return createArtifactCommands(resolved, "promote-summary", summary.commands);
  }

  if (isCheckSummaryLike(parsed)) {
    const summary = readAgentCheckSummaryPath(resolved);
    return createArtifactCommands(resolved, "check-summary", summary.commands);
  }

  if (isAgentManifestLike(parsed)) {
    const manifest = readAgentManifestPath(resolved);
    return createArtifactCommands(
      resolved,
      "manifest",
      relocateManifestCommands(manifest, resolved),
    );
  }

  if (isAgentFlowLike(parsed)) {
    await loadAgentSpec(resolved);
    return createArtifactCommands(resolved, "flow", runCommands(originalPath));
  }

  throw new Error(`unsupported agent artifact for commands: ${originalPath}`);
}
