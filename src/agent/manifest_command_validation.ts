import type { AgentManifest } from "./manifest";
import { findManifestFileStoredPath } from "./manifest_command_files";
import {
  compareManifestCommandMaps,
  readManifestPrimaryCommands,
} from "./manifest_command_primary";
import { checkPathCommand, checkRootFlag } from "./manifest_command_target_checks";

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
