import { formatAgentArtifactCommandLines, type AgentArtifactCommands } from "./commands";
import type { AgentValidationEntry, AgentValidationResult } from "./validate";

export type AgentInspectFormattedResult = {
  ok: boolean;
  kind: AgentArtifactCommands["kind"] | "unknown";
  targetPath: string;
  directory?: {
    isDirectory: boolean;
    manifestPath: string;
    hasManifest: boolean;
    hint?: string;
  };
  validation: AgentValidationResult;
  commands?: AgentArtifactCommands;
  manifest?: {
    path: string;
    kind: string;
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
    validation?: {
      ok: boolean;
      stages: Array<{
        name: string;
        ok: boolean;
        totalCount: number;
        failureCount: number;
      }>;
    };
  };
};

export function formatAgentInspectLines(result: AgentInspectFormattedResult): string[] {
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
