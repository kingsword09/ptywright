import type { AgentPromoteCommandSource, AgentPromoteSummary } from "./promote_summary_types";

export function defaultAgentPromoteCommands(
  summary: AgentPromoteCommandSource,
): AgentPromoteSummary["commands"] {
  const promote = [
    "ptywright",
    "agent",
    "promote",
    summary.sourcePath,
    "--cassette-dir",
    summary.cassetteDir,
    "--snapshot-dir",
    summary.snapshotDir,
    "--artifacts-root",
    summary.artifactsRoot,
  ];
  if (summary.updateSnapshots) {
    promote.push("--update-snapshots");
  }

  const check = [
    "ptywright",
    "agent",
    "check",
    summary.cassetteDir,
    "--artifacts-root",
    summary.artifactsRoot,
  ];

  return {
    promote: { argv: promote },
    check: { argv: check },
    updateSnapshots: { argv: [...check, "--update-snapshots"] },
    rerun: { argv: ["ptywright", "agent", "rerun", summary.summaryPath] },
  };
}
