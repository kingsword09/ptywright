import { dirname, isAbsolute, resolve } from "node:path";

import { diffCommandMaps } from "../common/compare";
import { readAgentCheckSummaryPath } from "./check_summary";
import type { AgentManifest } from "./manifest";
import { manifestPrimaryFile } from "./manifest_command_files";
import type { AgentCommandMap } from "./manifest_command_relocation";
import { readAgentPromoteSummaryPath } from "./promote_summary";
import { formatAgentArgv, readAgentRunRecordPath } from "./run_record";
import { readAgentReplaySummaryPath } from "./summary";

export function readManifestPrimaryCommands(
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

export function compareManifestCommandMaps(
  actual: AgentCommandMap,
  expected: AgentCommandMap,
  failures: string[],
): void {
  failures.push(
    ...diffCommandMaps({
      actual,
      expected,
      onNameMismatch: (expectedNames) =>
        `manifest command names must match primary artifact commands: ${expectedNames.join(",")}`,
      onArgvMismatch: (name, expectedArgv) =>
        `command ${name} argv must match primary artifact ${formatAgentArgv(expectedArgv)}`,
    }),
  );
}
