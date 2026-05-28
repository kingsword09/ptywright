import { existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { readAgentArtifactCommandsPath, type AgentArtifactCommands } from "./commands";
import { maybeReadManifest, type AgentInspectManifestSummary } from "./inspect_manifest";
import { AGENT_MANIFEST_FILE_NAME } from "./manifest";
import {
  validateAgentArtifactFile,
  validateAgentArtifactsPath,
  type AgentValidationResult,
} from "./validate";
export { formatAgentInspectLines } from "./inspect_format";
export type { AgentInspectManifestSummary } from "./inspect_manifest";

export type AgentInspectResult = {
  path: string;
  targetPath: string;
  kind: AgentArtifactCommands["kind"] | "unknown";
  ok: boolean;
  directory?: {
    isDirectory: boolean;
    manifestPath: string;
    hasManifest: boolean;
    hint?: string;
  };
  validation: AgentValidationResult;
  commands?: AgentArtifactCommands;
  manifest?: AgentInspectManifestSummary;
};

export async function inspectAgentArtifactPath(path: string): Promise<AgentInspectResult> {
  const target = resolveInspectTarget(path);
  const targetPath = target.targetPath;
  const validation = await validateInspectTarget(path, targetPath);
  const commands = await maybeReadCommands(targetPath);
  const manifest = maybeReadManifest(targetPath);

  return {
    path: resolve(process.cwd(), path),
    targetPath,
    kind: commands?.kind ?? validation.entries[0]?.kind ?? "unknown",
    ok: validation.ok,
    directory: target.directory,
    validation,
    commands,
    manifest,
  };
}

function resolveInspectTarget(path: string): {
  targetPath: string;
  directory?: AgentInspectResult["directory"];
} {
  const resolved = resolve(process.cwd(), path);
  const stat = statSync(resolved);
  if (!stat.isDirectory()) return { targetPath: resolved };

  const manifestPath = join(resolved, AGENT_MANIFEST_FILE_NAME);
  const hasManifest = existsSync(manifestPath);
  return {
    targetPath: hasManifest ? manifestPath : resolved,
    directory: {
      isDirectory: true,
      manifestPath,
      hasManifest,
      hint: hasManifest
        ? undefined
        : `${AGENT_MANIFEST_FILE_NAME} is required for portable commands/exec bundle workflows; use agent validate <dir> for recursive discovery.`,
    },
  };
}

async function validateInspectTarget(
  originalPath: string,
  targetPath: string,
): Promise<AgentValidationResult> {
  if (targetPath !== resolve(process.cwd(), originalPath)) {
    const entry = await validateAgentArtifactFile(targetPath);
    return {
      ok: entry.ok,
      path: targetPath,
      totalCount: 1,
      failureCount: entry.ok ? 0 : 1,
      entries: [entry],
    };
  }

  return validateAgentArtifactsPath(targetPath);
}

async function maybeReadCommands(path: string): Promise<AgentArtifactCommands | undefined> {
  try {
    return await readAgentArtifactCommandsPath(path);
  } catch {
    return undefined;
  }
}
