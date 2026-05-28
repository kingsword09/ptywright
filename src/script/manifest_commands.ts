import { dirname, isAbsolute, join, resolve } from "node:path";

import { diffCommandMaps } from "../common/compare";
import { portableCliPath } from "../common/path";
import type { ScriptManifest } from "./manifest_types";
import { readScriptRunSummaryPath, type ScriptRunSummaryCommands } from "./summary";

export function validateScriptManifestCommands(
  manifest: ScriptManifest,
  manifestPath?: string,
): void {
  const failures: string[] = [];
  const summaryPath = resolveManifestPrimaryPath(manifest, manifestPath);

  try {
    const summary = readScriptRunSummaryPath(summaryPath);
    compareCommandMaps(manifest.commands, summary.commands, failures);
  } catch (error) {
    failures.push(
      `unable to read manifest primary summary ${summaryPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (failures.length > 0) {
    throw new Error(`invalid script manifest commands: ${failures.join("; ")}`);
  }
}

export function relocateScriptManifestCommands(
  manifest: ScriptManifest,
  manifestPath: string,
): ScriptRunSummaryCommands {
  return Object.fromEntries(
    Object.entries(manifest.commands).map(([name, command]) => [
      name,
      {
        argv: relocateScriptCommandArgv(
          command.argv,
          dirname(resolve(process.cwd(), manifestPath)),
        ),
      },
    ]),
  ) as ScriptRunSummaryCommands;
}

export function resolveManifestPrimaryPath(
  manifest: ScriptManifest,
  manifestPath?: string,
): string {
  const baseDir = manifestPath
    ? dirname(resolve(process.cwd(), manifestPath))
    : resolve(process.cwd(), manifest.rootDir);
  const primaryFile =
    manifest.files.find((file) => file.kind === "run-summary" && file.role === "summary") ??
    manifest.files.find((file) => file.kind === "run-summary");

  if (primaryFile) {
    return isAbsolute(primaryFile.path) ? primaryFile.path : join(baseDir, primaryFile.path);
  }

  return isAbsolute(manifest.primaryPath)
    ? manifest.primaryPath
    : resolve(process.cwd(), manifest.primaryPath);
}

function relocateScriptCommandArgv(argv: readonly string[], rootDir: string): string[] {
  if (argv[0] !== "ptywright" || argv[1] !== "run-all") return [...argv];
  return setArgvFlag([...argv], "--artifacts-root", portableCliPath(rootDir));
}

function setArgvFlag(argv: string[], flag: string, value: string): string[] {
  const index = argv.indexOf(flag);
  if (index >= 0) {
    return [...argv.slice(0, index + 1), value, ...argv.slice(index + 2)];
  }
  return [...argv, flag, value];
}

function compareCommandMaps(
  actual: Record<string, { argv: string[] }>,
  expected: Record<string, { argv: string[] }>,
  failures: string[],
): void {
  failures.push(
    ...diffCommandMaps({
      actual,
      expected,
      onNameMismatch: (expectedNames) =>
        `manifest command names must match primary summary commands: ${expectedNames.join(",")}`,
      onArgvMismatch: (name) => `command ${name} argv must match primary summary`,
    }),
  );
}
