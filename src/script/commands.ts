import { existsSync } from "node:fs";

import { formatArgv } from "../common/argv";
import {
  findScriptSummaryManifest,
  readScriptManifestPath,
  relocateScriptManifestCommands,
  resolveManifestPrimaryPath,
  resolveScriptManifestPath,
  SCRIPT_MANIFEST_FILE_NAME,
  validateScriptManifest,
} from "./manifest";
import {
  readScriptRunSummaryPath,
  resolveScriptRunSummaryPath,
  type ScriptRunSummaryCommands,
} from "./summary";

export type ScriptCommandName = keyof ScriptRunSummaryCommands & string;

export type ScriptCommandRecord = {
  argv: string[];
};

export type ScriptArtifactCommands = {
  path: string;
  kind: "run-summary";
  manifestPath?: string;
  cwd: string;
  shell: Record<ScriptCommandName, string>;
  commands: ScriptRunSummaryCommands;
};

export type SelectedScriptArtifactCommand = {
  path: string;
  kind: "run-summary";
  manifestPath?: string;
  cwd: string;
  name: ScriptCommandName;
  command: ScriptCommandRecord;
  shell: string;
};

export function readScriptArtifactCommandsPath(path: string): ScriptArtifactCommands {
  const manifestCommands = readManifestBackedCommands(path);
  if (manifestCommands) return manifestCommands;

  const resolved = resolveScriptRunSummaryPath(path);
  const summaryManifest = findScriptSummaryManifest(resolved);
  if (summaryManifest) {
    validateScriptManifest(summaryManifest.manifest, summaryManifest.manifestPath);
    return createScriptArtifactCommands(
      resolved,
      relocateScriptManifestCommands(summaryManifest.manifest, summaryManifest.manifestPath),
      { manifestPath: summaryManifest.manifestPath },
    );
  }

  const summary = readScriptRunSummaryPath(resolved);
  return createScriptArtifactCommands(resolved, summary.commands);
}

export function formatScriptArtifactCommandLines(result: ScriptArtifactCommands): string[] {
  return [
    `kind=${result.kind}`,
    `path=${result.path}`,
    result.manifestPath ? `manifest=${result.manifestPath}` : null,
    ...Object.entries(result.commands).map(
      ([name, command]) => `${name}: ${formatArgv(command.argv)}`,
    ),
  ].filter((line): line is string => line !== null);
}

export function selectScriptArtifactCommand(
  result: ScriptArtifactCommands,
  name: string,
): SelectedScriptArtifactCommand {
  if (!isScriptCommandName(name)) {
    const available = Object.keys(result.commands).sort().join(", ");
    throw new Error(
      `unknown script artifact command: ${name}${available ? ` (available: ${available})` : ""}`,
    );
  }

  const command = result.commands[name];
  return {
    path: result.path,
    kind: result.kind,
    manifestPath: result.manifestPath,
    cwd: result.cwd,
    name,
    command,
    shell: result.shell[name] ?? formatArgv(command.argv),
  };
}

export function validateScriptCommandArgv(argv: readonly string[], name = "<unknown>"): void {
  const [binary, subcommand] = argv;
  if (binary !== "ptywright" || subcommand !== "run-all") {
    throw new Error(`command ${name} argv must start with a supported ptywright script command`);
  }
}

function createScriptArtifactCommands(
  path: string,
  commands: ScriptRunSummaryCommands,
  options: { manifestPath?: string } = {},
): ScriptArtifactCommands {
  return {
    path,
    kind: "run-summary",
    manifestPath: options.manifestPath,
    cwd: process.cwd(),
    shell: Object.fromEntries(
      Object.entries(commands).map(([name, command]) => [name, formatArgv(command.argv)]),
    ) as Record<ScriptCommandName, string>,
    commands,
  };
}

function readManifestBackedCommands(path: string): ScriptArtifactCommands | null {
  const manifestPath = resolveScriptManifestPath(path);
  if (!manifestPath.endsWith(SCRIPT_MANIFEST_FILE_NAME)) return null;
  if (!existsSync(manifestPath)) return null;

  const manifest = readScriptManifestPath(manifestPath);
  validateScriptManifest(manifest, manifestPath);
  return createScriptArtifactCommands(
    resolveManifestPrimaryPath(manifest, manifestPath),
    relocateScriptManifestCommands(manifest, manifestPath),
    { manifestPath },
  );
}

function isScriptCommandName(name: string): name is ScriptCommandName {
  return name === "runAll" || name === "updateGoldens";
}
