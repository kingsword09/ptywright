import { mkdirSync, writeFileSync } from "node:fs";
import { basename, join, relative } from "node:path";

import { normalizePath } from "../common/path";
import type { RunScriptPathResult } from "./path";
import { renderSuiteReportHtml } from "./suite_report_html";
import { scriptManifestPath, writeScriptManifestPath } from "./manifest";
import {
  makeScriptRunSummaryCommands,
  writeScriptRunSummaryPath,
  type ScriptRunFailureArtifacts,
  type ScriptRunSummary,
  type ScriptRunSummaryEntry,
} from "./summary";

export type SuiteReportEntry = {
  filePath: string;
  durationMs: number;
  result: RunScriptPathResult;
};

export function writeSuiteReportArtifacts(args: {
  dir: string;
  suiteDir: string;
  stepsPath?: string;
  durationMs: number;
  entries: SuiteReportEntry[];
}): { reportPath: string; summaryPath: string } {
  mkdirSync(args.suiteDir, { recursive: true });

  const reportPath = join(args.suiteDir, "index.html");
  const summaryPath = join(args.suiteDir, "run.summary.json");

  const failures = args.entries.filter((e) => !e.result.ok);

  const summary: ScriptRunSummary = {
    version: 1,
    ok: failures.length === 0,
    dir: args.dir,
    suiteDir: args.suiteDir,
    commands: makeScriptRunSummaryCommands(args),
    totalCount: args.entries.length,
    failureCount: failures.length,
    durationMs: args.durationMs,
    reportPath,
    summaryPath,
    entries: args.entries.map((entry): ScriptRunSummaryEntry => {
      const filePathRel = normalizePath(relative(process.cwd(), entry.filePath));
      const scriptName =
        entry.result.scriptName ?? basename(entry.filePath).replace(/\.(json|ts)$/i, "");

      const common = {
        filePath: entry.filePath,
        filePathRel,
        scriptName,
        ok: entry.result.ok,
        durationMs: entry.durationMs,
        artifactsDir: entry.result.artifactsDir,
        reportPath: entry.result.reportPath,
        castPath: entry.result.castPath,
      };

      if (entry.result.ok) return common;

      return {
        ...common,
        ok: false,
        error: entry.result.error,
        failureArtifacts: entry.result.failureArtifacts as ScriptRunFailureArtifacts | undefined,
      };
    }),
  };

  writeScriptRunSummaryPath(summaryPath, summary);

  const html = renderSuiteReportHtml({ reportPath, summaryPath, summary });
  writeFileSync(reportPath, html, "utf8");
  writeSuiteManifest({
    suiteDir: args.suiteDir,
    summary,
  });

  return { reportPath, summaryPath };
}

function writeSuiteManifest(args: { suiteDir: string; summary: ScriptRunSummary }): void {
  writeScriptManifestPath(scriptManifestPath(args.suiteDir), {
    ok: args.summary.ok,
    rootDir: args.suiteDir,
    primaryPath: args.summary.summaryPath,
    commands: args.summary.commands,
    totalCount: args.summary.totalCount,
    failureCount: args.summary.failureCount,
    files: [
      { path: args.summary.summaryPath, kind: "run-summary", role: "summary", ok: args.summary.ok },
      { path: args.summary.reportPath, kind: "report", role: "suite-report", ok: args.summary.ok },
      ...args.summary.entries.flatMap((entry) => [
        { path: entry.reportPath, kind: "report" as const, role: "entry-report", ok: entry.ok },
        { path: entry.castPath, kind: "cast" as const, role: "cast", ok: entry.ok },
        {
          path: entry.artifactsDir ? join(entry.artifactsDir, "test.data.js") : undefined,
          kind: "data" as const,
          role: "test-data",
          ok: entry.ok,
        },
        ...(!entry.ok && entry.failureArtifacts
          ? [
              {
                path: entry.failureArtifacts.lastTextPath,
                kind: "failure" as const,
                role: "last-text",
                ok: false,
              },
              {
                path: entry.failureArtifacts.lastViewPath,
                kind: "failure" as const,
                role: "last-view",
                ok: false,
              },
              {
                path: entry.failureArtifacts.stepPath,
                kind: "failure" as const,
                role: "step",
                ok: false,
              },
              {
                path: entry.failureArtifacts.errorPath,
                kind: "failure" as const,
                role: "error",
                ok: false,
              },
            ]
          : []),
      ]),
    ],
  });
}
