import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { TerminalSession } from "../session/terminal_session";
import { ensureAsciinemaPlayerAssets } from "../trace/asciinema_player_assets";
import { generateTraceReportHtml } from "../trace/report";
import type { RoutineStepResult } from "./routine_types";

export async function tryWriteRoutineReport(args: {
  sessionId: string;
  session: TerminalSession;
  results: RoutineStepResult[];
  failed: boolean;
  reportPath?: string;
}): Promise<string | undefined> {
  try {
    const castSnapshot = await args.session.snapshotCast();
    const html = await generateTraceReportHtml(castSnapshot.cast, {
      scriptName: "routine",
      result: { ok: !args.failed, error: args.results[args.results.length - 1]?.error },
      steps: args.results.map((result) => ({
        index: result.index,
        step: { type: result.action, description: result.description },
        ok: result.ok,
        error: result.error,
        after: result.snapshot
          ? { text: result.snapshot, hash: result.hash ?? "", kind: "view" }
          : undefined,
      })),
    });

    const reportPath = args.reportPath ?? defaultRoutineReportPath(args.sessionId);
    writeFileSync(reportPath, html);
    ensureAsciinemaPlayerAssets(reportPath);
    return reportPath;
  } catch {
    return args.reportPath;
  }
}

function defaultRoutineReportPath(sessionId: string): string {
  const tmpDir = join(tmpdir(), "ptywright-routines");
  mkdirSync(tmpDir, { recursive: true });
  return join(tmpDir, `routine-${sessionId}-${Date.now()}.html`);
}
