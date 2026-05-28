import { dirname, isAbsolute, join, resolve } from "node:path";

import { portableCliPath } from "../common/path";
import type { AgentManifest, AgentManifestFileKind } from "./manifest";

export type AgentPrimaryManifestKind =
  | "run-record"
  | "replay-summary"
  | "promote-summary"
  | "check-summary";

export function findManifestFileStoredPath(
  manifest: AgentManifest,
  kind: AgentManifestFileKind,
  role: string,
): string | null {
  const file =
    manifest.files.find((candidate) => candidate.kind === kind && candidate.role === role) ??
    manifest.files.find((candidate) => candidate.kind === kind);
  return file?.path ?? null;
}

export function manifestPrimaryFile(manifest: AgentManifest): {
  path: string;
  kind: AgentPrimaryManifestKind;
} | null {
  if (manifest.kind === "run") {
    return findManifestFile(manifest, "run-record", "record");
  }
  if (manifest.kind === "check") {
    return findManifestFile(manifest, "check-summary", "summary");
  }
  if (manifest.kind === "replay-suite") {
    return findManifestFile(manifest, "replay-summary", "summary");
  }
  return findManifestFile(manifest, "promote-summary", "summary");
}

export function findManifestFilePath(
  manifest: AgentManifest,
  manifestDir: string,
  kind: string,
  role: string,
): string | null {
  const file =
    manifest.files.find((candidate) => candidate.kind === kind && candidate.role === role) ??
    manifest.files.find((candidate) => candidate.kind === kind);
  if (!file) return null;
  return portableCliPath(isAbsolute(file.path) ? file.path : join(manifestDir, file.path));
}

export function findManifestReplayInputDir(
  manifest: AgentManifest,
  manifestDir: string,
): string | null {
  const relativeRecordPath = manifest.files.find(
    (file) => file.kind === "run-record" && !isAbsolute(file.path),
  )?.path;
  const [replayRoot] = relativeRecordPath?.split(/[/\\]+/g) ?? [];
  if (replayRoot) {
    return portableCliPath(join(manifestDir, replayRoot));
  }

  const recordPaths = manifest.files
    .filter((file) => file.kind === "run-record")
    .map((file) => (isAbsolute(file.path) ? file.path : join(manifestDir, file.path)));

  if (recordPaths.length === 0) return null;

  const commonDir = commonAncestorDir(recordPaths);
  return commonDir ? portableCliPath(commonDir) : null;
}

function findManifestFile<TKind extends AgentPrimaryManifestKind>(
  manifest: AgentManifest,
  kind: TKind,
  role: string,
): { path: string; kind: TKind } | null {
  const file =
    manifest.files.find((candidate) => candidate.kind === kind && candidate.role === role) ??
    manifest.files.find((candidate) => candidate.kind === kind);
  if (!file) return null;
  return { path: file.path, kind };
}

function commonAncestorDir(paths: readonly string[]): string | null {
  const [first, ...rest] = paths.map((path) => resolve(process.cwd(), path));
  if (!first) return null;

  let parts = dirname(first).split(/[\\/]+/g);
  for (const path of rest) {
    const nextParts = dirname(path).split(/[\\/]+/g);
    const limit = Math.min(parts.length, nextParts.length);
    let index = 0;
    while (index < limit && parts[index] === nextParts[index]) {
      index += 1;
    }
    parts = parts.slice(0, index);
  }

  if (parts.length === 0) return null;
  return parts.join("/") || "/";
}
