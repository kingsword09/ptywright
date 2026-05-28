import { basename, dirname, isAbsolute, join, resolve } from "node:path";

import { AGENT_MANIFEST_FILE_NAME, readAgentManifestPath, type AgentManifest } from "./manifest";

export type AgentInspectManifestSummary = {
  path: string;
  kind: AgentManifest["kind"];
  ok: boolean;
  rootDir: string;
  primaryPath: string;
  generatedAt: string;
  validation?: AgentManifest["validation"];
  files: {
    totalCount: number;
    totalBytes: number;
    byKind: Record<string, number>;
    failures: Array<{
      path: string;
      kind: string;
      role?: string;
    }>;
  };
};

export function maybeReadManifest(path: string): AgentInspectManifestSummary | undefined {
  if (basename(path) !== AGENT_MANIFEST_FILE_NAME) {
    return undefined;
  }

  let manifest: AgentManifest;
  try {
    manifest = readAgentManifestPath(path);
  } catch {
    return undefined;
  }

  const byKind: Record<string, number> = {};
  let totalBytes = 0;
  const failures: AgentInspectManifestSummary["files"]["failures"] = [];
  for (const file of manifest.files) {
    byKind[file.kind] = (byKind[file.kind] ?? 0) + 1;
    totalBytes += file.bytes;
    if (file.ok === false) {
      failures.push({
        path: file.path,
        kind: file.kind,
        role: file.role,
      });
    }
  }

  return {
    path,
    kind: manifest.kind,
    ok: manifest.ok,
    rootDir: manifest.rootDir,
    primaryPath: resolveManifestPrimaryPath(manifest, path),
    generatedAt: manifest.generatedAt,
    validation: manifest.validation,
    files: {
      totalCount: manifest.files.length,
      totalBytes,
      byKind: Object.fromEntries(Object.entries(byKind).sort(([a], [b]) => a.localeCompare(b))),
      failures,
    },
  };
}

function resolveManifestPrimaryPath(manifest: AgentManifest, manifestPath: string): string {
  const manifestDir = dirname(manifestPath);
  const primaryFile =
    manifest.files.find((file) => file.role === "summary") ??
    manifest.files.find((file) => file.role === "record") ??
    manifest.files.find((file) => file.kind === "run-record") ??
    manifest.files.find((file) => file.kind.endsWith("-summary"));

  if (primaryFile) {
    return isAbsolute(primaryFile.path) ? primaryFile.path : join(manifestDir, primaryFile.path);
  }

  return isAbsolute(manifest.primaryPath)
    ? manifest.primaryPath
    : resolve(process.cwd(), manifest.primaryPath);
}
