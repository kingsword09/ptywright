import { join, relative, resolve } from "node:path";

import { runScriptPath } from "./path";
import type { RunScriptPathResult } from "./path";
import { parseRunAllArgs, printRunAllCliResult } from "./run_all_cli";
import { listScriptFiles, safeArtifactsDirName } from "./run_all_discovery";
import { writeSuiteReportArtifacts } from "./suite_report";

export type RunAllScriptsOptions = {
  dir?: string;
  artifactsRoot?: string;
  stepsPath?: string;
  updateGoldens?: boolean;
};

export type RunAllScriptsEntry = {
  filePath: string;
  durationMs: number;
  result: RunScriptPathResult;
};

export type RunAllScriptsResult = {
  ok: boolean;
  dir: string;
  suiteDir: string;
  durationMs: number;
  reportPath: string;
  summaryPath: string;
  entries: RunAllScriptsEntry[];
};

export async function runAllScripts(options?: RunAllScriptsOptions): Promise<RunAllScriptsResult> {
  const dir = resolve(options?.dir?.trim() ? options.dir.trim() : "scripts");
  const artifactsRoot = options?.artifactsRoot?.trim()
    ? resolve(options.artifactsRoot.trim())
    : null;
  const stepsPath = options?.stepsPath?.trim() ? options.stepsPath.trim() : undefined;

  const suiteDir = artifactsRoot ?? resolve(".tmp", "run-all");

  const filePaths = listScriptFiles(dir);
  const entries: RunAllScriptsEntry[] = [];

  const startedAt = Date.now();

  for (const filePath of filePaths) {
    const artifactsDirName = safeArtifactsDirName(relative(dir, filePath));
    const artifactsDir = join(suiteDir, "tests", artifactsDirName);

    const entryStartedAt = Date.now();
    const result = await runScriptPath(filePath, {
      artifactsDir,
      stepsPath,
      updateGoldens: options?.updateGoldens,
    });
    const durationMs = Date.now() - entryStartedAt;

    entries.push({ filePath, durationMs, result });
  }

  const durationMs = Date.now() - startedAt;

  const { reportPath, summaryPath } = writeSuiteReportArtifacts({
    dir,
    suiteDir,
    stepsPath,
    durationMs,
    entries,
  });

  return {
    ok: entries.every((e) => e.result.ok),
    dir,
    suiteDir,
    durationMs,
    reportPath,
    summaryPath,
    entries,
  };
}

if (import.meta.main) {
  try {
    const args = parseRunAllArgs(process.argv.slice(2));
    const result = await runAllScripts({
      dir: args.dir,
      artifactsRoot: args.artifactsRoot,
      stepsPath: args.stepsPath,
      updateGoldens: args.updateGoldens,
    });

    process.exitCode = printRunAllCliResult(result);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}
