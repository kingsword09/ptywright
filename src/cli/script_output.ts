import type { RunScriptPathResult } from "../script/path";
import type { RunAllScriptsResult } from "../script/run_all";
import type { ScriptRunSummary } from "../script/summary";
import { logLines } from "./common";

export function printRunResult(result: RunScriptPathResult): number {
  if (!result.ok) {
    logLines(
      [
        result.error,
        result.artifactsDir ? `artifacts=${result.artifactsDir}` : null,
        result.reportPath ? `report=${result.reportPath}` : null,
        result.castPath ? `cast=${result.castPath}` : null,
        result.failureArtifacts?.lastViewPath
          ? `last=${result.failureArtifacts.lastViewPath}`
          : null,
        result.failureArtifacts?.errorPath ? `error=${result.failureArtifacts.errorPath}` : null,
      ],
      true,
    );
    return 1;
  }

  logLines(
    [
      `ok artifacts=${result.artifactsDir}`,
      result.reportPath ? `report=${result.reportPath}` : null,
      result.castPath ? `cast=${result.castPath}` : null,
    ],
    false,
  );
  return 0;
}

export function printRunAllResult(result: RunAllScriptsResult): number {
  const failures = result.entries.filter((entry) => !entry.result.ok);

  if (failures.length === 0) {
    // eslint-disable-next-line no-console
    console.log(
      `ok count=${result.entries.length} dir=${result.dir}\nreport=${result.reportPath}\nsummary=${result.summaryPath}`,
    );
    return 0;
  }

  // eslint-disable-next-line no-console
  console.error(
    `failed count=${failures.length}/${result.entries.length} dir=${result.dir}\nreport=${result.reportPath}\nsummary=${result.summaryPath}`,
  );
  for (const failure of failures) {
    if (failure.result.ok) continue;
    // eslint-disable-next-line no-console
    console.error(`- ${failure.filePath}: ${failure.result.error}`);
    if (failure.result.failureArtifacts) {
      // eslint-disable-next-line no-console
      console.error(`  artifacts=${failure.result.artifactsDir ?? ""}`);
      // eslint-disable-next-line no-console
      console.error(`  last=${failure.result.failureArtifacts.lastViewPath}`);
      // eslint-disable-next-line no-console
      console.error(`  error=${failure.result.failureArtifacts.errorPath}`);
    }
  }
  return 1;
}

export function printScriptValidateResult(args: {
  summary: ScriptRunSummary;
  summaryPath: string;
  manifestPath?: string;
  json: boolean;
}): number {
  if (args.json) {
    logLines(
      [
        JSON.stringify(
          {
            ok: true,
            kind: args.manifestPath ? "manifest" : "run-summary",
            path: args.summaryPath,
            manifestPath: args.manifestPath,
            totalCount: args.summary.totalCount,
            failureCount: args.summary.failureCount,
          },
          null,
          2,
        ),
      ],
      false,
    );
    return 0;
  }

  logLines(
    [
      "ok script-summary",
      `path=${args.summaryPath}`,
      args.manifestPath ? `manifest=${args.manifestPath}` : null,
      `count=${args.summary.totalCount}`,
      `failures=${args.summary.failureCount}`,
    ],
    false,
  );
  return 0;
}
