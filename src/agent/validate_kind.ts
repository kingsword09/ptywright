import { readFileSync } from "node:fs";
import { extname } from "node:path";

import { readAgentCassettePath } from "./cassette";
import { readAgentCheckSummaryPath } from "./check_summary";
import {
  readAgentArtifactCommandsPath,
  validateAgentArtifactCommands,
  validateAgentCommandArgv,
  validateAgentManifestCommandTargets,
} from "./commands";
import { readAgentManifestPath, validateAgentManifestFiles } from "./manifest";
import { readAgentPromoteSummaryPath } from "./promote_summary";
import { readAgentRunRecordPath } from "./run_record";
import { normalizeAgentFlowSpec } from "./schema";
import { loadAgentSpec } from "./spec_loader";
import { readAgentReplaySummaryPath } from "./summary";
import type { AgentValidationKind } from "./validate_types";

export async function validateByKind(path: string, kind: AgentValidationKind): Promise<void> {
  if (kind === "flow") {
    if (extname(path) === ".json") {
      normalizeAgentFlowSpec(JSON.parse(readFileSync(path, "utf8")) as unknown);
      return;
    }
    await loadAgentSpec(path);
    return;
  }

  if (kind === "cassette") {
    readAgentCassettePath(path);
    return;
  }

  if (kind === "run-record") {
    validateRawAgentCommandArgv(path);
    readAgentRunRecordPath(path);
    await validateResolvedAgentArtifactCommands(path);
    return;
  }

  if (kind === "replay-summary") {
    validateRawAgentCommandArgv(path);
    readAgentReplaySummaryPath(path);
    await validateResolvedAgentArtifactCommands(path);
    return;
  }

  if (kind === "promote-summary") {
    validateRawAgentCommandArgv(path);
    readAgentPromoteSummaryPath(path);
    await validateResolvedAgentArtifactCommands(path);
    return;
  }

  if (kind === "manifest") {
    const manifest = readAgentManifestPath(path);
    validateAgentArtifactCommands(await readAgentArtifactCommandsPath(path));
    validateAgentManifestCommandTargets(manifest, path);
    validateAgentManifestFiles(manifest, path);
    return;
  }

  validateRawAgentCommandArgv(path);
  readAgentCheckSummaryPath(path);
  await validateResolvedAgentArtifactCommands(path);
}

async function validateResolvedAgentArtifactCommands(path: string): Promise<void> {
  const commands = await readAgentArtifactCommandsPath(path);
  validateAgentArtifactCommands(commands);

  if (!commands.manifestPath) return;

  const manifest = readAgentManifestPath(commands.manifestPath);
  validateAgentManifestCommandTargets(manifest, commands.manifestPath);
  validateAgentManifestFiles(manifest, commands.manifestPath);
}

function validateRawAgentCommandArgv(path: string): void {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  if (typeof parsed !== "object" || parsed === null) return;

  const commands = (parsed as { commands?: unknown }).commands;
  if (typeof commands !== "object" || commands === null || Array.isArray(commands)) return;

  for (const [name, command] of Object.entries(commands)) {
    const argv = typeof command === "object" && command !== null ? command.argv : undefined;
    if (!Array.isArray(argv) || !argv.every((arg): arg is string => typeof arg === "string")) {
      continue;
    }
    validateAgentCommandArgv(argv, name);
  }
}
