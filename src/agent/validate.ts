import { statSync } from "node:fs";
import { resolve } from "node:path";

import { inferAgentArtifactKind, listAgentArtifactFiles } from "./validate_files";
import { validateByKind } from "./validate_kind";
import type {
  AgentValidationEntry,
  AgentValidationOptions,
  AgentValidationResult,
} from "./validate_types";

export type {
  AgentValidationEntry,
  AgentValidationKind,
  AgentValidationOptions,
  AgentValidationResult,
} from "./validate_types";

export async function validateAgentArtifactsPath(
  path: string,
  options: AgentValidationOptions = {},
): Promise<AgentValidationResult> {
  const resolved = resolve(process.cwd(), path);
  const stat = statSync(resolved);
  const files = stat.isDirectory()
    ? listAgentArtifactFiles(resolved, Boolean(options.preferManifestBundle))
    : [resolved];
  const entries: AgentValidationEntry[] = [];

  for (const filePath of files) {
    entries.push(await validateAgentArtifactFile(filePath));
  }

  if (entries.length === 0) {
    entries.push({
      filePath: resolved,
      kind: "unknown",
      ok: false,
      error: "no agent artifacts found",
    });
  }

  const failureCount = entries.filter((entry) => !entry.ok).length;
  return {
    ok: failureCount === 0,
    path: resolved,
    totalCount: entries.length,
    failureCount,
    entries,
  };
}

export async function validateAgentArtifactFile(filePath: string): Promise<AgentValidationEntry> {
  const resolved = resolve(process.cwd(), filePath);
  const kind = inferAgentArtifactKind(resolved, true);

  if (!kind) {
    return {
      filePath: resolved,
      kind: "unknown",
      ok: false,
      error: "unsupported agent artifact",
    };
  }

  try {
    await validateByKind(resolved, kind);
    return { filePath: resolved, kind, ok: true };
  } catch (error) {
    return {
      filePath: resolved,
      kind,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
