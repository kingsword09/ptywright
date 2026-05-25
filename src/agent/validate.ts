import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";

import { isAgentCassetteLike, readAgentCassettePath } from "./cassette";
import { readAgentCheckSummaryPath } from "./check_summary";
import {
  readAgentArtifactCommandsPath,
  validateAgentArtifactCommands,
  validateAgentCommandArgv,
  validateAgentManifestCommandTargets,
} from "./commands";
import {
  AGENT_MANIFEST_FILE_NAME,
  isAgentManifestLike,
  readAgentManifestPath,
  validateAgentManifestFiles,
} from "./manifest";
import { readAgentPromoteSummaryPath } from "./promote_summary";
import { isAgentRunRecordLike, readAgentRunRecordPath } from "./run_record";
import { normalizeAgentFlowSpec } from "./schema";
import { loadAgentSpec } from "./spec_loader";
import { readAgentReplaySummaryPath } from "./summary";

export type AgentValidationKind =
  | "flow"
  | "cassette"
  | "run-record"
  | "replay-summary"
  | "promote-summary"
  | "check-summary"
  | "manifest";

export type AgentValidationEntry = {
  filePath: string;
  kind: AgentValidationKind | "unknown";
  ok: boolean;
  error?: string;
};

export type AgentValidationResult = {
  ok: boolean;
  path: string;
  totalCount: number;
  failureCount: number;
  entries: AgentValidationEntry[];
};

export type AgentValidationOptions = {
  preferManifestBundle?: boolean;
};

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

function listAgentArtifactFiles(dir: string, topLevel = false): string[] {
  const manifestPath = join(dir, AGENT_MANIFEST_FILE_NAME);
  if (topLevel && safeIsFile(manifestPath)) {
    return [manifestPath];
  }

  const out: string[] = [];

  for (const entry of readdirSync(dir)) {
    if (entry === ".git" || entry === "node_modules") continue;
    const abs = join(dir, entry);
    const stat = statSync(abs);
    if (stat.isDirectory()) {
      out.push(...listAgentArtifactFiles(abs));
      continue;
    }
    if (inferAgentArtifactKind(abs, false)) {
      out.push(abs);
    }
  }

  return out.sort((a, b) => a.localeCompare(b));
}

function safeIsFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

async function validateByKind(path: string, kind: AgentValidationKind): Promise<void> {
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

function inferAgentArtifactKind(
  path: string,
  allowExplicitFlowFile: boolean,
): AgentValidationKind | null {
  const name = basename(path);
  if (name.endsWith(".cassette.json")) return "cassette";
  if (name.endsWith(".agent-run.json")) return "run-record";
  if (name === "agent-replay.summary.json") return "replay-summary";
  if (name === "agent-promote.summary.json") return "promote-summary";
  if (name === "agent-check.summary.json") return "check-summary";
  if (name === AGENT_MANIFEST_FILE_NAME) return "manifest";
  if (name.endsWith(".flow.json") || name.endsWith(".flow.ts")) return "flow";

  const ext = extname(path);
  if (allowExplicitFlowFile && (ext === ".json" || ext === ".ts")) {
    return inferExplicitArtifactKind(path);
  }

  if (ext === ".json") {
    return inferJsonArtifactKind(path);
  }

  return null;
}

function inferExplicitArtifactKind(path: string): AgentValidationKind | null {
  if (extname(path) === ".ts") return "flow";
  return inferJsonArtifactKind(path) ?? "flow";
}

function inferJsonArtifactKind(path: string): AgentValidationKind | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch {
    return null;
  }

  if (isAgentCassetteLike(parsed)) return "cassette";
  if (isAgentRunRecordLike(parsed)) return "run-record";
  if (isPromoteSummaryLike(parsed)) return "promote-summary";
  if (isCheckSummaryLike(parsed)) return "check-summary";
  if (isReplaySummaryLike(parsed)) return "replay-summary";
  if (isAgentManifestLike(parsed)) return "manifest";
  if (isAgentFlowLike(parsed)) return "flow";
  return null;
}

function isPromoteSummaryLike(input: unknown): boolean {
  return (
    typeof input === "object" &&
    input !== null &&
    "targetCassettePath" in input &&
    "validation" in input &&
    "replay" in input &&
    Array.isArray((input as { failures?: unknown }).failures)
  );
}

function isReplaySummaryLike(input: unknown): boolean {
  return (
    typeof input === "object" &&
    input !== null &&
    Array.isArray((input as { entries?: unknown }).entries) &&
    "totalCount" in input &&
    "failureCount" in input
  );
}

function isCheckSummaryLike(input: unknown): boolean {
  return (
    typeof input === "object" &&
    input !== null &&
    "inputs" in input &&
    "outputs" in input &&
    "replay" in input &&
    Array.isArray((input as { failures?: unknown }).failures)
  );
}

function isAgentFlowLike(input: unknown): boolean {
  return (
    typeof input === "object" &&
    input !== null &&
    "launch" in input &&
    Array.isArray((input as { steps?: unknown }).steps)
  );
}
