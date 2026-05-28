import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { readAgentCassettePath } from "./cassette";
import { replayAllAgentRecords } from "./replay_all";
import { formatAgentPromoteSummary } from "./promote_format";
import { emptyReplayResult, resolveSourceCassettePath } from "./promote_helpers";
import { writePromoteManifest } from "./promote_manifest";
import { writeAgentPromoteSummaryPath } from "./promote_summary";
import type { AgentPromoteOptions, AgentPromoteResult } from "./promote_types";
import { sanitizeArtifactName } from "./normalize";
import { validateAgentArtifactsPath } from "./validate";

export { formatAgentPromoteLines, formatAgentPromoteSummary } from "./promote_format";
export type { AgentPromoteOptions, AgentPromoteResult } from "./promote_types";

export async function promoteAgentCassette(
  options: AgentPromoteOptions,
): Promise<AgentPromoteResult> {
  const sourcePath = resolve(process.cwd(), options.sourcePath);
  const sourceCassettePath = resolveSourceCassettePath(sourcePath);
  const sourceCassette = readAgentCassettePath(sourceCassettePath);
  const name = sanitizeArtifactName(sourceCassette.name);
  const cassetteDir = options.cassetteDir ?? "tests/agent-cassettes";
  const snapshotDir =
    options.snapshotDir ?? join(options.snapshotRoot ?? "tests/agent-snapshots", name);
  const artifactsRoot = options.artifactsRoot ?? join(".tmp", "agent-promote", name);
  const targetDir = join(cassetteDir, name);
  const targetCassettePath = join(targetDir, `${name}.cassette.json`);
  const summaryPath = join(artifactsRoot, "agent-promote.summary.json");
  const updateSnapshots = options.updateSnapshots ?? false;

  mkdirSync(targetDir, { recursive: true });
  mkdirSync(artifactsRoot, { recursive: true });

  const promotedCassette = {
    ...sourceCassette,
    spec: {
      ...sourceCassette.spec,
      snapshotDir,
    },
  };
  writeFileSync(targetCassettePath, JSON.stringify(promotedCassette, null, 2) + "\n", "utf8");

  const validation = await validateAgentArtifactsPath(targetCassettePath);
  let replay = emptyReplayResult(targetDir, artifactsRoot, updateSnapshots);
  if (validation.ok) {
    replay = await replayAllAgentRecords({
      dir: targetDir,
      artifactsRoot,
      headless: options.headless ?? true,
      updateSnapshots,
    });
  }

  const result = {
    ok: validation.ok && replay.ok,
    sourcePath: options.sourcePath,
    cassetteDir,
    targetDir,
    targetCassettePath,
    snapshotDir,
    artifactsRoot,
    summaryPath,
    updateSnapshots,
    validation,
    replay,
  };
  writeAgentPromoteSummaryPath(summaryPath, formatAgentPromoteSummary(result));
  writePromoteManifest(result);
  return result;
}
