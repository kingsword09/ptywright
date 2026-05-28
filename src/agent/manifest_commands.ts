import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

import { portableCliPath, samePath } from "../common/path";
import { AGENT_MANIFEST_FILE_NAME, readAgentManifestPath, type AgentManifest } from "./manifest";
import {
  findManifestReplayInputDir,
  manifestPrimaryFile,
  type AgentPrimaryManifestKind,
} from "./manifest_command_files";

export type { AgentPrimaryManifestKind } from "./manifest_command_files";
export type { AgentCommandMap } from "./manifest_command_relocation";
export { relocateManifestCommands } from "./manifest_command_relocation";
export { validateAgentManifestCommandTargets } from "./manifest_command_validation";

export type AgentMovedPrimaryManifestBundle = {
  manifestPath: string;
  artifactsRoot: string;
  replayInputDir: string | null;
};

export function findMovedPrimaryManifestBundle(
  artifactPath: string,
  kind: AgentPrimaryManifestKind,
): AgentMovedPrimaryManifestBundle | null {
  const bundle = readMovedPrimaryManifest(resolve(process.cwd(), artifactPath), kind);
  if (!bundle) return null;
  const manifestDir = dirname(bundle.manifestPath);
  return {
    manifestPath: bundle.manifestPath,
    artifactsRoot: portableCliPath(manifestDir),
    replayInputDir: findManifestReplayInputDir(bundle.manifest, manifestDir),
  };
}

export function readMovedPrimaryManifest(
  artifactPath: string,
  kind: AgentPrimaryManifestKind,
): { manifest: AgentManifest; manifestPath: string } | null {
  const manifestPath = join(dirname(artifactPath), AGENT_MANIFEST_FILE_NAME);
  if (!existsSync(manifestPath)) return null;

  let manifest: AgentManifest;
  try {
    manifest = readAgentManifestPath(manifestPath);
  } catch {
    return null;
  }

  const primary = manifestPrimaryFile(manifest);
  if (!primary || primary.kind !== kind) return null;

  const primaryPath = isAbsolute(primary.path)
    ? primary.path
    : resolve(dirname(manifestPath), primary.path);
  if (!samePath(primaryPath, artifactPath)) return null;
  if (samePath(manifest.rootDir, dirname(manifestPath))) return null;

  return { manifest, manifestPath };
}
