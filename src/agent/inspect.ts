import { existsSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";

import {
  formatAgentArtifactCommandLines,
  readAgentArtifactCommandsPath,
  type AgentArtifactCommands,
} from "./commands";
import { AGENT_MANIFEST_FILE_NAME, readAgentManifestPath, type AgentManifest } from "./manifest";
import {
  validateAgentArtifactFile,
  validateAgentArtifactsPath,
  type AgentValidationEntry,
  type AgentValidationResult,
} from "./validate";

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

export function formatAgentInspectLines(result: AgentInspectResult): string[] {
  const lines = [
    `${result.ok ? "ok" : "failed"} agent-inspect`,
    `kind=${result.kind}`,
    `path=${result.targetPath}`,
    `validation=${result.validation.ok ? "ok" : "failed"} count=${result.validation.totalCount}`,
  ];

  if (result.validation.failureCount > 0) {
    lines.push(`failures=${result.validation.failureCount}`);
    lines.push(...formatValidationFailures(result.validation.entries));
  }

  if (result.directory) {
    lines.push(
      `directoryManifest=${result.directory.hasManifest ? "found" : "missing"} path=${result.directory.manifestPath}`,
    );
    if (result.directory.hint) {
      lines.push(`hint=${result.directory.hint}`);
    }
  }

  if (result.manifest) {
    lines.push(
      `manifest=${result.manifest.path}`,
      `manifestKind=${result.manifest.kind}`,
      `manifestFiles=${result.manifest.files.totalCount}`,
      `manifestBytes=${result.manifest.files.totalBytes}`,
    );
    for (const [kind, count] of Object.entries(result.manifest.files.byKind)) {
      lines.push(`manifestFileKind.${kind}=${count}`);
    }
    if (result.manifest.validation) {
      lines.push(
        `manifestValidation=${result.manifest.validation.ok ? "ok" : "failed"}`,
        ...result.manifest.validation.stages.map(
          (stage) =>
            `manifestStage.${stage.name}=${stage.ok ? "ok" : "failed"} count=${stage.totalCount} failures=${stage.failureCount}`,
        ),
      );
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
      ...formatAgentArtifactCommandLines(result.commands)
        .filter((line) => !line.startsWith("kind=") && !line.startsWith("path="))
        .map((line) => `command.${line}`),
    );
  }

  return lines;
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

function maybeReadManifest(path: string): AgentInspectManifestSummary | undefined {
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

function formatValidationFailures(entries: readonly AgentValidationEntry[]): string[] {
  return entries
    .filter((entry) => !entry.ok)
    .flatMap((entry) => [
      `- ${entry.filePath}`,
      `  kind=${entry.kind}`,
      entry.error ? `  error=${entry.error}` : null,
    ])
    .filter((line): line is string => line !== null);
}
