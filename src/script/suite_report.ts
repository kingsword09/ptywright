import { mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";

import type { RunScriptPathResult } from "./path";

export type SuiteReportEntry = {
  filePath: string;
  durationMs: number;
  result: RunScriptPathResult;
};

export type SuiteRunFailureArtifacts = {
  lastTextPath: string;
  lastViewPath: string;
  stepPath: string;
  errorPath: string;
};

export type SuiteRunSummary = {
  version: 1;
  ok: boolean;
  dir: string;
  suiteDir: string;
  totalCount: number;
  failureCount: number;
  durationMs: number;
  reportPath: string;
  summaryPath: string;
  entries: Array<{
    filePath: string;
    filePathRel: string;
    scriptName: string;
    ok: boolean;
    durationMs: number;
    artifactsDir?: string;
    reportPath?: string;
    castPath?: string;
    error?: string;
    failureArtifacts?: SuiteRunFailureArtifacts;
  }>;
};

export function writeSuiteReportArtifacts(args: {
  dir: string;
  suiteDir: string;
  durationMs: number;
  entries: SuiteReportEntry[];
}): { reportPath: string; summaryPath: string } {
  mkdirSync(args.suiteDir, { recursive: true });

  const reportPath = join(args.suiteDir, "index.html");
  const summaryPath = join(args.suiteDir, "run.summary.json");

  const failures = args.entries.filter((e) => !e.result.ok);

  const summary: SuiteRunSummary = {
    version: 1,
    ok: failures.length === 0,
    dir: args.dir,
    suiteDir: args.suiteDir,
    totalCount: args.entries.length,
    failureCount: failures.length,
    durationMs: args.durationMs,
    reportPath,
    summaryPath,
    entries: args.entries.map((entry) => {
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
        failureArtifacts: entry.result.failureArtifacts as SuiteRunFailureArtifacts | undefined,
      };
    }),
  };

  writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  const html = renderSuiteReportHtml({ reportPath, summaryPath, summary });
  writeFileSync(reportPath, html, "utf8");

  return { reportPath, summaryPath };
}

function renderSuiteReportHtml(args: {
  reportPath: string;
  summaryPath: string;
  summary: SuiteRunSummary;
}): string {
  const title = "ptywright script report";

  const resultLabel = args.summary.ok ? "PASS" : "FAIL";
  const resultClass = args.summary.ok ? "pass" : "fail";

  const rowsHtml = args.summary.entries
    .map((entry) => {
      const statusLabel = entry.ok ? "PASS" : "FAIL";
      const statusClass = entry.ok ? "pass" : "fail";

      const reportHref = entry.reportPath ? relativeHref(args.reportPath, entry.reportPath) : null;
      const castHref = entry.castPath ? relativeHref(args.reportPath, entry.castPath) : null;

      const lastHref =
        !entry.ok && entry.failureArtifacts?.lastViewPath
          ? relativeHref(args.reportPath, entry.failureArtifacts.lastViewPath)
          : null;

      const errorHref =
        !entry.ok && entry.failureArtifacts?.errorPath
          ? relativeHref(args.reportPath, entry.failureArtifacts.errorPath)
          : null;

      const links = [
        reportHref ? `<a href="${escapeHtml(reportHref)}">report</a>` : null,
        castHref ? `<a href="${escapeHtml(castHref)}">cast</a>` : null,
        lastHref ? `<a href="${escapeHtml(lastHref)}">last</a>` : null,
        errorHref ? `<a href="${escapeHtml(errorHref)}">error</a>` : null,
      ]
        .filter(Boolean)
        .join(" ");

      const errorText = !entry.ok && entry.error ? entry.error : "";

      return `<tr class="${statusClass}">
  <td><span class="badge ${statusClass}">${escapeHtml(statusLabel)}</span></td>
  <td class="mono">${escapeHtml(entry.scriptName)}</td>
  <td class="mono">${escapeHtml(entry.filePathRel)}</td>
  <td class="mono">${escapeHtml(formatDuration(entry.durationMs))}</td>
  <td class="mono">${links || ""}</td>
  <td class="mono error">${escapeHtml(errorText)}</td>
</tr>`;
    })
    .join("\n");

  const summaryHref = relativeHref(args.reportPath, args.summaryPath);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        color-scheme: light dark;
      }
      body {
        margin: 0;
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto,
          Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";
        line-height: 1.4;
      }
      header {
        padding: 16px;
        border-bottom: 1px solid color-mix(in oklab, currentColor 20%, transparent);
      }
      header h1 {
        margin: 0 0 8px 0;
        font-size: 18px;
      }
      header .badges {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin: 6px 0 10px 0;
      }
      .badge {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 2px 10px;
        font-size: 12px;
        border: 1px solid color-mix(in oklab, currentColor 16%, transparent);
        background: color-mix(in oklab, currentColor 6%, transparent);
      }
      .badge.pass {
        background: color-mix(in oklab, #16a34a 18%, transparent);
        border-color: color-mix(in oklab, #16a34a 45%, transparent);
      }
      .badge.fail {
        background: color-mix(in oklab, #ef4444 18%, transparent);
        border-color: color-mix(in oklab, #ef4444 45%, transparent);
      }
      header .meta {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
          "Liberation Mono", "Courier New", monospace;
        font-size: 12px;
        opacity: 0.8;
        white-space: pre-wrap;
      }
      main {
        padding: 16px;
      }
      a {
        color: inherit;
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      th,
      td {
        padding: 10px 8px;
        border-bottom: 1px solid color-mix(in oklab, currentColor 14%, transparent);
        vertical-align: top;
        text-align: left;
      }
      th {
        font-size: 12px;
        opacity: 0.8;
      }
      tr.fail {
        background: color-mix(in oklab, #ef4444 6%, transparent);
      }
      .mono {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
          "Liberation Mono", "Courier New", monospace;
        font-size: 12px;
      }
      .error {
        color: color-mix(in oklab, #ef4444 70%, currentColor);
      }
    </style>
  </head>
  <body>
    <header>
      <h1>${escapeHtml(title)}</h1>
      <div class="badges">
        <span class="badge ${resultClass}">result=${escapeHtml(resultLabel)}</span>
        <span class="badge">count=${args.summary.totalCount}</span>
        <span class="badge">failures=${args.summary.failureCount}</span>
        <span class="badge">duration=${escapeHtml(formatDuration(args.summary.durationMs))}</span>
      </div>
      <div class="meta">dir=${escapeHtml(args.summary.dir)}
summary=<a href="${escapeHtml(summaryHref)}">run.summary.json</a></div>
    </header>
    <main>
      <table>
        <thead>
          <tr>
            <th>Status</th>
            <th>Script</th>
            <th>File</th>
            <th>Duration</th>
            <th>Artifacts</th>
            <th>Error</th>
          </tr>
        </thead>
        <tbody>
${rowsHtml}
        </tbody>
      </table>
    </main>
  </body>
</html>`;
}

function formatDuration(ms: number): string {
  const safe = Math.max(0, Math.trunc(ms));
  if (safe < 1000) return `${safe}ms`;
  return `${(safe / 1000).toFixed(2)}s`;
}

function relativeHref(fromFile: string, toFile: string): string {
  const rel = relative(dirname(fromFile), toFile);
  const normalized = normalizePath(rel);
  return normalized.startsWith(".") ? normalized : `./${normalized}`;
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
