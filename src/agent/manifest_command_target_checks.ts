import { dirname, isAbsolute, resolve } from "node:path";

import { samePath } from "../common/path";
import type { AgentManifest } from "./manifest";

export function checkPathCommand(
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

export function checkRootFlag(manifest: AgentManifest, name: string, failures: string[]): void {
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

function getArgvFlag(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index < 0) return undefined;
  return argv[index + 1];
}
