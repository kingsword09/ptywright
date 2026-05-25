import { existsSync } from "node:fs";
import { basename, resolve } from "node:path";

import {
  formatScriptArtifactCommandLines,
  readScriptArtifactCommandsPath,
  type ScriptArtifactCommands,
} from "./commands";
import {
  readScriptManifestPath,
  resolveManifestPrimaryPath,
  resolveScriptManifestPath,
  SCRIPT_MANIFEST_FILE_NAME,
  validateScriptManifest,
} from "./manifest";
import { readScriptRunSummaryPath } from "./summary";

export type ScriptInspectResult = {
  path: string;
  targetPath: string;
  kind: "run-summary" | "manifest";
  ok: boolean;
  commands?: ScriptArtifactCommands;
  manifest?: {
    path: string;
    ok: boolean;
    rootDir: string;
    primaryPath: string;
    generatedAt: string;
    totalCount: number;
    failureCount: number;
    files: {
      totalCount: number;
      totalBytes: number;
      byKind: Record<string, number>;
      failures: Array<{ path: string; kind: string; role?: string }>;
    };
  };
};

export function inspectScriptArtifactPath(path: string): ScriptInspectResult {
  const manifestPath = resolveScriptManifestPath(path);
  const hasManifest = existsSync(manifestPath);
  const commands = readScriptArtifactCommandsPath(hasManifest ? manifestPath : path);
  const manifest = hasManifest ? maybeReadManifest(manifestPath) : undefined;

  if (!manifest) {
    readScriptRunSummaryPath(path);
  }

  return {
    path: resolve(process.cwd(), path),
    targetPath: hasManifest ? manifestPath : resolve(process.cwd(), path),
    kind: hasManifest ? "manifest" : "run-summary",
    ok: true,
    commands,
    manifest,
  };
}

export function formatScriptInspectLines(result: ScriptInspectResult): string[] {
  const lines = ["ok script-inspect", `kind=${result.kind}`, `path=${result.targetPath}`];

  if (result.manifest) {
    lines.push(
      `manifest=${result.manifest.path}`,
      `manifestFiles=${result.manifest.files.totalCount}`,
      `manifestBytes=${result.manifest.files.totalBytes}`,
      `total=${result.manifest.totalCount}`,
      `failures=${result.manifest.failureCount}`,
    );
    for (const [kind, count] of Object.entries(result.manifest.files.byKind)) {
      lines.push(`manifestFileKind.${kind}=${count}`);
    }
    if (result.manifest.files.failures.length > 0) {
      lines.push(
        ...result.manifest.files.failures.map(
          (file) =>
            `manifestFileFailure=${file.path} kind=${file.kind}${file.role ? ` role=${file.role}` : ""}`,
        ),
      );
    }
  }

  if (result.commands) {
    if (result.commands.manifestPath) {
      lines.push(`commandsManifest=${result.commands.manifestPath}`);
    }
    lines.push(
      `commands=${Object.keys(result.commands.commands).sort().join(",")}`,
      ...formatScriptArtifactCommandLines(result.commands)
        .filter((line) => !line.startsWith("kind=") && !line.startsWith("path="))
        .map((line) => `command.${line}`),
    );
  }

  return lines;
}

function maybeReadManifest(path: string): ScriptInspectResult["manifest"] | undefined {
  if (basename(path) !== SCRIPT_MANIFEST_FILE_NAME) return undefined;

  const manifest = readScriptManifestPath(path);
  validateScriptManifest(manifest, path);

  const byKind: Record<string, number> = {};
  let totalBytes = 0;
  const failures: NonNullable<ScriptInspectResult["manifest"]>["files"]["failures"] = [];

  for (const file of manifest.files) {
    byKind[file.kind] = (byKind[file.kind] ?? 0) + 1;
    totalBytes += file.bytes;
    if (file.ok === false) {
      failures.push({ path: file.path, kind: file.kind, role: file.role });
    }
  }

  return {
    path,
    ok: manifest.ok,
    rootDir: manifest.rootDir,
    primaryPath: resolveManifestPrimaryPath(manifest, path),
    generatedAt: manifest.generatedAt,
    totalCount: manifest.totalCount,
    failureCount: manifest.failureCount,
    files: {
      totalCount: manifest.files.length,
      totalBytes,
      byKind: Object.fromEntries(Object.entries(byKind).sort(([a], [b]) => a.localeCompare(b))),
      failures,
    },
  };
}
