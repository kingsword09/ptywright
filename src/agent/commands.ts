import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";

import { isAgentCassetteLike, readAgentCassettePath } from "./cassette";
import { readAgentCheckSummaryPath } from "./check_summary";
import {
  AGENT_MANIFEST_FILE_NAME,
  isAgentManifestLike,
  readAgentManifestPath,
  type AgentManifest,
  type AgentManifestFileKind,
} from "./manifest";
import { readAgentPromoteSummaryPath } from "./promote_summary";
import {
  formatAgentArgv,
  isAgentRunRecordLike,
  readAgentRunRecordPath,
  type AgentCommandRecord,
} from "./run_record";
import { loadAgentSpec } from "./spec_loader";
import { readAgentReplaySummaryPath } from "./summary";

export type AgentCommandArtifactKind =
  | "flow"
  | "cassette"
  | "run-record"
  | "replay-summary"
  | "promote-summary"
  | "check-summary"
  | "manifest";

export type AgentCommandMap = Record<string, AgentCommandRecord>;
type AgentPrimaryManifestKind =
  | "run-record"
  | "replay-summary"
  | "promote-summary"
  | "check-summary";

export type AgentMovedPrimaryManifestBundle = {
  manifestPath: string;
  artifactsRoot: string;
  replayInputDir: string | null;
};

export type AgentArtifactCommands = {
  path: string;
  kind: AgentCommandArtifactKind;
  manifestPath?: string;
  cwd: string;
  shell: Record<string, string>;
  commands: AgentCommandMap;
};

export type SelectedAgentArtifactCommand = {
  path: string;
  kind: AgentCommandArtifactKind;
  manifestPath?: string;
  cwd: string;
  name: string;
  command: AgentCommandRecord;
  shell: string;
};

export async function readAgentArtifactCommandsPath(path: string): Promise<AgentArtifactCommands> {
  const resolved = resolveAgentArtifactCommandsPath(path);
  const name = basename(resolved);

  if (name.endsWith(".agent-run.json")) {
    const bundleCommands = readPrimaryManifestCommands(resolved, "run-record");
    if (bundleCommands) return bundleCommands;

    const record = readAgentRunRecordPath(resolved);
    return createArtifactCommands(resolved, "run-record", record.commands);
  }

  if (name === "agent-replay.summary.json") {
    const bundleCommands = readPrimaryManifestCommands(resolved, "replay-summary");
    if (bundleCommands) return bundleCommands;

    const summary = readAgentReplaySummaryPath(resolved);
    return createArtifactCommands(resolved, "replay-summary", summary.commands);
  }

  if (name === "agent-promote.summary.json") {
    const bundleCommands = readPrimaryManifestCommands(resolved, "promote-summary");
    if (bundleCommands) return bundleCommands;

    const summary = readAgentPromoteSummaryPath(resolved);
    return createArtifactCommands(resolved, "promote-summary", summary.commands);
  }

  if (name === "agent-check.summary.json") {
    const bundleCommands = readPrimaryManifestCommands(resolved, "check-summary");
    if (bundleCommands) return bundleCommands;

    const summary = readAgentCheckSummaryPath(resolved);
    return createArtifactCommands(resolved, "check-summary", summary.commands);
  }

  if (name === AGENT_MANIFEST_FILE_NAME) {
    const manifest = readAgentManifestPath(resolved);
    return createArtifactCommands(
      resolved,
      "manifest",
      relocateManifestCommands(manifest, resolved),
    );
  }

  if (name.endsWith(".cassette.json")) {
    readAgentCassettePath(resolved);
    return createArtifactCommands(resolved, "cassette", replayCommands(path));
  }

  if (name.endsWith(".flow.json") || name.endsWith(".flow.ts")) {
    await loadAgentSpec(resolved);
    return createArtifactCommands(resolved, "flow", runCommands(path));
  }

  return inferJsonCommands(resolved, path);
}

function resolveAgentArtifactCommandsPath(path: string): string {
  const resolved = resolve(process.cwd(), path);
  const stats = statSync(resolved, { throwIfNoEntry: false });
  if (!stats?.isDirectory()) {
    return resolved;
  }

  const manifestPath = join(resolved, AGENT_MANIFEST_FILE_NAME);
  if (existsSync(manifestPath)) {
    return manifestPath;
  }

  throw new Error(
    `agent artifact directory is missing ${AGENT_MANIFEST_FILE_NAME}: ${path}. ` +
      "Pass a supported artifact file, or a manifest bundle directory.",
  );
}

function readPrimaryManifestCommands(
  artifactPath: string,
  kind: AgentPrimaryManifestKind,
): AgentArtifactCommands | null {
  const bundle = readMovedPrimaryManifest(artifactPath, kind);
  if (!bundle) return null;

  return createArtifactCommands(
    artifactPath,
    kind,
    relocateManifestCommands(bundle.manifest, bundle.manifestPath),
    { manifestPath: bundle.manifestPath },
  );
}

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

function readMovedPrimaryManifest(
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

export function formatAgentArtifactCommandLines(result: AgentArtifactCommands): string[] {
  return [
    `kind=${result.kind}`,
    `path=${result.path}`,
    result.manifestPath ? `manifest=${result.manifestPath}` : null,
    ...Object.entries(result.commands).map(
      ([name, command]) => `${name}: ${formatAgentArgv(command.argv)}`,
    ),
  ].filter((line): line is string => line !== null);
}

export function selectAgentArtifactCommand(
  result: AgentArtifactCommands,
  name: string,
): SelectedAgentArtifactCommand {
  const command = result.commands[name];
  if (!command) {
    const available = Object.keys(result.commands).sort().join(", ");
    throw new Error(
      `unknown agent artifact command: ${name}${available ? ` (available: ${available})` : ""}`,
    );
  }
  return {
    path: result.path,
    kind: result.kind,
    manifestPath: result.manifestPath,
    cwd: result.cwd,
    name,
    command,
    shell: result.shell[name] ?? formatAgentArgv(command.argv),
  };
}

export function validateAgentArtifactCommands(result: AgentArtifactCommands): void {
  for (const [name, command] of Object.entries(result.commands)) {
    validateAgentCommandArgv(command.argv, name);
  }
}

export function validateAgentManifestCommandTargets(
  manifest: AgentManifest,
  manifestPath?: string,
): void {
  const failures: string[] = [];
  const primaryCommands = readManifestPrimaryCommands(manifest, manifestPath, failures);
  if (primaryCommands) {
    compareManifestCommandMaps(manifest.commands, primaryCommands, failures);
  }

  if (manifest.kind === "run") {
    const recordPath = findManifestFileStoredPath(manifest, "run-record", "record");
    if (!recordPath) {
      failures.push("missing manifest run-record file for replay command");
    } else {
      checkPathCommand(manifest, "replay", "replay", recordPath, manifestPath, failures);
      checkPathCommand(manifest, "updateSnapshots", "replay", recordPath, manifestPath, failures);
    }
  }

  if (manifest.kind === "check") {
    const summaryPath = findManifestFileStoredPath(manifest, "check-summary", "summary");
    if (!summaryPath) {
      failures.push("missing manifest check-summary file for rerun command");
    } else {
      checkPathCommand(manifest, "rerun", "rerun", summaryPath, manifestPath, failures);
    }

    checkRootFlag(manifest, "check", failures);
    checkRootFlag(manifest, "updateSnapshots", failures);
  }

  if (manifest.kind === "replay-suite") {
    const summaryPath = findManifestFileStoredPath(manifest, "replay-summary", "summary");
    if (!summaryPath) {
      failures.push("missing manifest replay-summary file for rerun command");
    } else {
      checkPathCommand(manifest, "rerun", "rerun", summaryPath, manifestPath, failures);
    }

    checkRootFlag(manifest, "replayAll", failures);
    checkRootFlag(manifest, "updateSnapshots", failures);
  }

  if (manifest.kind === "promote") {
    const summaryPath = findManifestFileStoredPath(manifest, "promote-summary", "summary");
    if (!summaryPath) {
      failures.push("missing manifest promote-summary file for rerun command");
    } else {
      checkPathCommand(manifest, "rerun", "rerun", summaryPath, manifestPath, failures);
    }

    checkRootFlag(manifest, "promote", failures);
    checkRootFlag(manifest, "check", failures);
    checkRootFlag(manifest, "updateSnapshots", failures);
  }

  if (failures.length > 0) {
    throw new Error(`invalid agent manifest commands: ${failures.join("; ")}`);
  }
}

export function validateAgentCommandArgv(argv: readonly string[], name = "<unknown>"): void {
  const [binary, group, subcommand] = argv;
  if (binary !== "ptywright" || group !== "agent" || !isSupportedAgentSubcommand(subcommand)) {
    throw new Error(`command ${name} argv must start with a supported ptywright agent command`);
  }
}

function sameArgv(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function findManifestFileStoredPath(
  manifest: AgentManifest,
  kind: AgentManifestFileKind,
  role: string,
): string | null {
  const file =
    manifest.files.find((candidate) => candidate.kind === kind && candidate.role === role) ??
    manifest.files.find((candidate) => candidate.kind === kind);
  return file?.path ?? null;
}

function readManifestPrimaryCommands(
  manifest: AgentManifest,
  manifestPath: string | undefined,
  failures: string[],
): AgentCommandMap | null {
  const primary = manifestPrimaryFile(manifest);
  if (!primary) {
    failures.push(`missing manifest primary artifact for ${manifest.kind}`);
    return null;
  }

  const baseDir = manifestPath
    ? dirname(resolve(process.cwd(), manifestPath))
    : resolve(process.cwd(), manifest.rootDir);
  const filePath = isAbsolute(primary.path) ? primary.path : resolve(baseDir, primary.path);

  try {
    if (primary.kind === "run-record") {
      return readAgentRunRecordPath(filePath).commands;
    }
    if (primary.kind === "check-summary") {
      return readAgentCheckSummaryPath(filePath).commands;
    }
    if (primary.kind === "replay-summary") {
      return readAgentReplaySummaryPath(filePath).commands;
    }
    if (primary.kind === "promote-summary") {
      return readAgentPromoteSummaryPath(filePath).commands;
    }
  } catch (error) {
    failures.push(
      `unable to read manifest primary artifact ${primary.path}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  return null;
}

function manifestPrimaryFile(manifest: AgentManifest): {
  path: string;
  kind: "run-record" | "check-summary" | "replay-summary" | "promote-summary";
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

function findManifestFile<
  TKind extends "run-record" | "check-summary" | "replay-summary" | "promote-summary",
>(manifest: AgentManifest, kind: TKind, role: string): { path: string; kind: TKind } | null {
  const file =
    manifest.files.find((candidate) => candidate.kind === kind && candidate.role === role) ??
    manifest.files.find((candidate) => candidate.kind === kind);
  if (!file) return null;
  return { path: file.path, kind };
}

function compareManifestCommandMaps(
  actual: AgentCommandMap,
  expected: AgentCommandMap,
  failures: string[],
): void {
  const actualNames = Object.keys(actual).sort();
  const expectedNames = Object.keys(expected).sort();
  if (!sameStringList(actualNames, expectedNames)) {
    failures.push(
      `manifest command names must match primary artifact commands: ${expectedNames.join(",")}`,
    );
  }

  for (const [name, command] of Object.entries(expected)) {
    const actualCommand = actual[name];
    if (!actualCommand) continue;
    if (!sameArgv(actualCommand.argv, command.argv)) {
      failures.push(
        `command ${name} argv must match primary artifact ${formatAgentArgv(command.argv)}`,
      );
    }
  }
}

function sameStringList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function checkPathCommand(
  manifest: AgentManifest,
  name: string,
  subcommand: string,
  expectedStoredPath: string,
  manifestPath: string | undefined,
  failures: string[],
): void {
  const command = manifest.commands[name];
  if (!command) return;
  const [binary, group, actualSubcommand, targetPath] = command.argv;
  if (binary !== "ptywright" || group !== "agent" || actualSubcommand !== subcommand) {
    failures.push(`command ${name} argv must be ptywright agent ${subcommand}`);
    return;
  }
  if (
    !targetPath ||
    !sameManifestStoredPath(targetPath, manifest, expectedStoredPath, manifestPath)
  ) {
    failures.push(`command ${name} argv must target manifest file ${expectedStoredPath}`);
  }
}

function checkRootFlag(manifest: AgentManifest, name: string, failures: string[]): void {
  const command = manifest.commands[name];
  if (!command) return;
  const value = getArgvFlag(command.argv, "--artifacts-root");
  if (!value || !samePath(value, manifest.rootDir)) {
    failures.push(`command ${name} argv must target manifest rootDir`);
  }
}

function manifestStoredPath(manifest: AgentManifest, path: string): string {
  if (isAbsolute(path)) return path;
  return resolve(process.cwd(), manifest.rootDir, path);
}

function sameManifestStoredPath(
  actual: string,
  manifest: AgentManifest,
  expectedStoredPath: string,
  manifestPath: string | undefined,
): boolean {
  if (samePath(actual, manifestStoredPath(manifest, expectedStoredPath))) {
    return true;
  }

  if (!manifestPath || isAbsolute(expectedStoredPath)) {
    return false;
  }

  return samePath(
    actual,
    resolve(dirname(resolve(process.cwd(), manifestPath)), expectedStoredPath),
  );
}

function samePath(left: string, right: string): boolean {
  return resolve(process.cwd(), left) === resolve(process.cwd(), right);
}

function getArgvFlag(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index < 0) return undefined;
  return argv[index + 1];
}

async function inferJsonCommands(
  resolved: string,
  originalPath: string,
): Promise<AgentArtifactCommands> {
  const ext = extname(resolved);
  if (ext !== ".json" && ext !== ".ts") {
    throw new Error(`unsupported agent artifact for commands: ${originalPath}`);
  }

  if (ext === ".ts") {
    await loadAgentSpec(resolved);
    return createArtifactCommands(resolved, "flow", runCommands(originalPath));
  }

  const parsed = JSON.parse(readFileSync(resolved, "utf8")) as unknown;
  if (isAgentCassetteLike(parsed)) {
    readAgentCassettePath(resolved);
    return createArtifactCommands(resolved, "cassette", replayCommands(originalPath));
  }

  if (isAgentRunRecordLike(parsed)) {
    const record = readAgentRunRecordPath(resolved);
    return createArtifactCommands(resolved, "run-record", record.commands);
  }

  if (isReplaySummaryLike(parsed)) {
    const summary = readAgentReplaySummaryPath(resolved);
    return createArtifactCommands(resolved, "replay-summary", summary.commands);
  }

  if (isPromoteSummaryLike(parsed)) {
    const summary = readAgentPromoteSummaryPath(resolved);
    return createArtifactCommands(resolved, "promote-summary", summary.commands);
  }

  if (isCheckSummaryLike(parsed)) {
    const summary = readAgentCheckSummaryPath(resolved);
    return createArtifactCommands(resolved, "check-summary", summary.commands);
  }

  if (isAgentManifestLike(parsed)) {
    const manifest = readAgentManifestPath(resolved);
    return createArtifactCommands(
      resolved,
      "manifest",
      relocateManifestCommands(manifest, resolved),
    );
  }

  if (isAgentFlowLike(parsed)) {
    await loadAgentSpec(resolved);
    return createArtifactCommands(resolved, "flow", runCommands(originalPath));
  }

  throw new Error(`unsupported agent artifact for commands: ${originalPath}`);
}

function createArtifactCommands(
  path: string,
  kind: AgentCommandArtifactKind,
  commands: AgentCommandMap,
  options: { manifestPath?: string } = {},
): AgentArtifactCommands {
  return {
    path,
    kind,
    manifestPath: options.manifestPath,
    cwd: process.cwd(),
    shell: Object.fromEntries(
      Object.entries(commands).map(([name, command]) => [name, formatAgentArgv(command.argv)]),
    ),
    commands,
  };
}

function relocateManifestCommands(manifest: AgentManifest, manifestPath: string): AgentCommandMap {
  return Object.fromEntries(
    Object.entries(manifest.commands).map(([name, command]) => [
      name,
      { argv: relocateManifestArgv(command.argv, manifest, manifestPath) },
    ]),
  );
}

function relocateManifestArgv(
  argv: readonly string[],
  manifest: AgentManifest,
  manifestPath: string,
): string[] {
  const [, , subcommand] = argv;
  if (argv[0] !== "ptywright" || argv[1] !== "agent") {
    return [...argv];
  }

  const manifestDir = dirname(manifestPath);
  const artifactsRootArg = portableCliPath(manifestDir);

  if (subcommand === "replay") {
    const recordPath = findManifestFilePath(manifest, manifestDir, "run-record", "record");
    if (!recordPath) return [...argv];
    return [argv[0]!, argv[1]!, argv[2]!, recordPath, ...argv.slice(4)];
  }

  if (subcommand === "rerun") {
    if (manifest.kind === "replay-suite") {
      const replayDir = findManifestReplayInputDir(manifest, manifestDir);
      if (replayDir) {
        return setArgvFlag(
          [argv[0]!, argv[1]!, "replay-all", replayDir, ...argv.slice(4)],
          "--artifacts-root",
          artifactsRootArg,
        );
      }
    }

    const summaryPath = findManifestSummaryPath(manifest, manifestDir);
    if (!summaryPath) return [...argv];
    return setArgvFlag(
      [argv[0]!, argv[1]!, argv[2]!, summaryPath, ...argv.slice(4)],
      "--artifacts-root",
      artifactsRootArg,
    );
  }

  if (subcommand === "replay-all" && manifest.kind === "replay-suite") {
    const replayDir = findManifestReplayInputDir(manifest, manifestDir);
    return setArgvFlag(
      [argv[0]!, argv[1]!, argv[2]!, replayDir ?? argv[3] ?? "", ...argv.slice(4)],
      "--artifacts-root",
      artifactsRootArg,
    );
  }

  if (subcommand === "check" || subcommand === "replay-all" || subcommand === "promote") {
    return setArgvFlag([...argv], "--artifacts-root", artifactsRootArg);
  }

  return [...argv];
}

function findManifestSummaryPath(manifest: AgentManifest, manifestDir: string): string | null {
  if (manifest.kind === "check") {
    return findManifestFilePath(manifest, manifestDir, "check-summary", "summary");
  }

  if (manifest.kind === "replay-suite") {
    return findManifestFilePath(manifest, manifestDir, "replay-summary", "summary");
  }

  if (manifest.kind === "promote") {
    return findManifestFilePath(manifest, manifestDir, "promote-summary", "summary");
  }

  return null;
}

function findManifestReplayInputDir(manifest: AgentManifest, manifestDir: string): string | null {
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

function findManifestFilePath(
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

function setArgvFlag(argv: string[], flag: string, value: string): string[] {
  const index = argv.indexOf(flag);
  if (index >= 0) {
    return [...argv.slice(0, index + 1), value, ...argv.slice(index + 2)];
  }
  return [...argv, flag, value];
}

function portableCliPath(path: string): string {
  const abs = resolve(process.cwd(), path);
  const rel = relative(process.cwd(), abs);
  if (rel && !rel.startsWith("..") && !isAbsolute(rel)) {
    return rel;
  }
  return abs;
}

function replayCommands(path: string): AgentCommandMap {
  const replay = ["ptywright", "agent", "replay", path];
  return {
    replay: { argv: replay },
    updateSnapshots: { argv: [...replay, "--update-snapshots"] },
  };
}

function runCommands(path: string): AgentCommandMap {
  const run = ["ptywright", "agent", "run", path];
  return {
    run: { argv: run },
    updateSnapshots: { argv: [...run, "--update-snapshots"] },
  };
}

function isSupportedAgentSubcommand(value: string | undefined): boolean {
  return (
    value === "run" ||
    value === "record" ||
    value === "replay" ||
    value === "promote" ||
    value === "replay-all" ||
    value === "rerun" ||
    value === "commands" ||
    value === "inspect" ||
    value === "exec" ||
    value === "check" ||
    value === "validate" ||
    value === "init"
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
