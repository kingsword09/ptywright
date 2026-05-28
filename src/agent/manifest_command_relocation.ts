import { dirname } from "node:path";

import { portableCliPath } from "../common/path";
import type { AgentManifest } from "./manifest";
import type { AgentCommandRecord } from "./run_record";
import { findManifestFilePath, findManifestReplayInputDir } from "./manifest_command_files";

export type AgentCommandMap = Record<string, AgentCommandRecord>;

export function relocateManifestCommands(
  manifest: AgentManifest,
  manifestPath: string,
): AgentCommandMap {
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

function setArgvFlag(argv: string[], flag: string, value: string): string[] {
  const index = argv.indexOf(flag);
  if (index >= 0) {
    return [...argv.slice(0, index + 1), value, ...argv.slice(index + 2)];
  }
  return [...argv, flag, value];
}
