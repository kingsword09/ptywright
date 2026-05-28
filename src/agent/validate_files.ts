import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join } from "node:path";

import { isAgentCassetteLike } from "./cassette";
import { AGENT_MANIFEST_FILE_NAME, isAgentManifestLike } from "./manifest";
import { isAgentRunRecordLike } from "./run_record";
import type { AgentValidationKind } from "./validate_types";

export function listAgentArtifactFiles(dir: string, topLevel = false): string[] {
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

export function inferAgentArtifactKind(
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

function safeIsFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
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
