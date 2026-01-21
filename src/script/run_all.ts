import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { runScriptPath } from "./path";
import type { RunScriptPathResult } from "./path";
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

function safeArtifactsDirName(relPath: string): string {
  return relPath.replace(/[/\\]/g, "__");
}

function shouldIncludeJsonScript(filePath: string): boolean {
  try {
    const raw = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;

    const obj = parsed as { launch?: unknown; steps?: unknown };
    if (!obj.launch || typeof obj.launch !== "object" || Array.isArray(obj.launch)) return false;

    const launch = obj.launch as { command?: unknown };
    if (typeof launch.command !== "string" || !launch.command.trim()) return false;

    return Array.isArray(obj.steps) && obj.steps.length > 0;
  } catch {
    // If a .json file is invalid JSON, keep legacy behavior: let it fail as a script.
    return true;
  }
}

function listScriptFiles(dir: string): string[] {
  const out: string[] = [];

  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    const stat = statSync(abs);
    if (stat.isDirectory()) {
      out.push(...listScriptFiles(abs));
      continue;
    }

    if (entry.endsWith(".json")) {
      if (shouldIncludeJsonScript(abs)) out.push(abs);
      continue;
    }

    if (!entry.endsWith(".ts")) continue;
    if (entry.endsWith(".d.ts")) continue;
    if (entry.endsWith("_steps.ts") || entry.endsWith(".steps.ts")) continue;

    out.push(abs);
  }

  return out.sort((a, b) => a.localeCompare(b));
}

function parseArgs(argv: string[]): {
  dir?: string;
  artifactsRoot?: string;
  stepsPath?: string;
  updateGoldens: boolean;
} {
  const out: {
    dir?: string;
    artifactsRoot?: string;
    stepsPath?: string;
    updateGoldens: boolean;
  } = { updateGoldens: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (!out.dir && arg && !arg.startsWith("-")) {
      out.dir = arg;
      continue;
    }

    if (arg === "--dir" && next) {
      out.dir = next;
      i += 1;
      continue;
    }

    if (arg === "--artifacts-root" && next) {
      out.artifactsRoot = next;
      i += 1;
      continue;
    }

    if (arg === "--steps" && next) {
      out.stepsPath = next;
      i += 1;
      continue;
    }

    if (arg === "--update-goldens") {
      out.updateGoldens = true;
      continue;
    }

    throw new Error(`unknown arg: ${arg ?? ""}`);
  }

  return out as {
    dir?: string;
    artifactsRoot?: string;
    stepsPath?: string;
    updateGoldens: boolean;
  };
}

if (import.meta.main) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = await runAllScripts({
      dir: args.dir,
      artifactsRoot: args.artifactsRoot,
      stepsPath: args.stepsPath,
      updateGoldens: args.updateGoldens,
    });

    const failures = result.entries.filter((e) => !e.result.ok);

    if (failures.length === 0) {
      // eslint-disable-next-line no-console
      console.log(
        `ok count=${result.entries.length} dir=${result.dir}\nreport=${result.reportPath}\nsummary=${result.summaryPath}`,
      );
      process.exitCode = 0;
    } else {
      // eslint-disable-next-line no-console
      console.error(
        `failed count=${failures.length}/${result.entries.length} dir=${result.dir}\nreport=${result.reportPath}\nsummary=${result.summaryPath}`,
      );
      for (const f of failures) {
        if (f.result.ok) continue;
        // eslint-disable-next-line no-console
        console.error(`- ${f.filePath}: ${f.result.error}`);
        if (f.result.failureArtifacts) {
          // eslint-disable-next-line no-console
          console.error(`  artifacts=${f.result.artifactsDir ?? ""}`);
          // eslint-disable-next-line no-console
          console.error(`  last=${f.result.failureArtifacts.lastViewPath}`);
          // eslint-disable-next-line no-console
          console.error(`  error=${f.result.failureArtifacts.errorPath}`);
        }
      }
      process.exitCode = 1;
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}
