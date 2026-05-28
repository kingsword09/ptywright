import { dirname, resolve } from "node:path";

import type { replayAllAgentRecords } from "./replay_all";
import { readAgentRunRecordPath } from "./run_record";

export function resolveSourceCassettePath(sourcePath: string): string {
  if (sourcePath.endsWith(".cassette.json")) {
    return sourcePath;
  }

  if (sourcePath.endsWith(".agent-run.json")) {
    const record = readAgentRunRecordPath(sourcePath);
    if (!record.cassettePath) {
      throw new Error(`agent run record does not reference a cassette: ${sourcePath}`);
    }
    return resolve(dirname(sourcePath), record.cassettePath);
  }

  throw new Error(`agent promote requires .cassette.json or .agent-run.json: ${sourcePath}`);
}

export function emptyReplayResult(
  dir: string,
  suiteDir: string,
  updateSnapshots: boolean,
): Awaited<ReturnType<typeof replayAllAgentRecords>> {
  return {
    ok: false,
    dir,
    suiteDir,
    durationMs: 0,
    reportPath: "",
    summaryPath: "",
    updateSnapshots,
    entries: [],
  };
}
