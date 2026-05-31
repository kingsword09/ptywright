import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { relativeHref } from "../common/path";
import { formatAgentArgv } from "./run_record";
import type { AgentReplayAllEntry } from "./replay_all_types";
import type { AgentRunResult } from "./runner";
import { escapeAttribute, escapeHtml } from "./html_escape";
import { renderReportThemeCss } from "./report_theme_css";

export function renderFailedEntryReport(result: AgentRunResult): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(result.name)} failed replay</title>
    <style>
${renderReportThemeCss()}

    .hero {
      margin-bottom: 24px;
    }
    .hero h1 {
      margin-bottom: 12px;
    }
    .error-block {
      margin-top: 20px;
    }
    .error-block h2 {
      margin-bottom: 10px;
      color: var(--fail);
    }
    </style>
  </head>
  <body>
    <div class="rail fail"></div>
    <div class="shell">
      <div class="hero">
        <div class="statusline fail">
          <span class="dot"></span>
          <span>FAILED</span>
        </div>
        <h1>${escapeHtml(result.name)}</h1>
        <p style="color: var(--muted); margin: 8px 0 0;">Replay failed before the agent runner could start.</p>
      </div>
      <div class="panel error-block">
        <h2>Error Details</h2>
        <div class="codeblock">
          <pre>${escapeHtml(result.errors.join("\n"))}</pre>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

export function writeReplayAllReport(
  path: string,
  args: {
    dir: string;
    durationMs: number;
    updateSnapshots: boolean;
    entries: AgentReplayAllEntry[];
    summaryPath: string;
  },
): void {
  mkdirSync(dirname(path), { recursive: true });

  // Sort entries: failed first, then by name
  const sortedEntries = [...args.entries].sort((a, b) => {
    if (a.result.ok !== b.result.ok) return a.result.ok ? 1 : -1;
    return a.result.name.localeCompare(b.result.name);
  });

  const rows = sortedEntries.map((entry) => renderEntry(entry, path)).join("\n");
  const ok = args.entries.every((entry) => entry.result.ok);
  const passCount = args.entries.filter((e) => e.result.ok).length;
  const failCount = args.entries.length - passCount;
  const passRate = args.entries.length > 0 ? (passCount / args.entries.length) * 100 : 0;

  writeFileSync(
    path,
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Agent Replay Report · ${ok ? "Passed" : "Failed"}</title>
    <style>
${renderReportThemeCss()}

    /* Hero section with pass-rate visualization */
    .hero {
      margin-bottom: 28px;
    }
    .hero-title {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 18px;
      flex-wrap: wrap;
    }
    .hero-stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 12px;
      margin-bottom: 16px;
    }
    .hero-stat {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .hero-stat-value {
      font-size: 32px;
      font-weight: 700;
      line-height: 1;
      font-variant-numeric: tabular-nums;
      letter-spacing: -0.02em;
    }
    .hero-stat-value.pass { color: var(--pass); }
    .hero-stat-value.fail { color: var(--fail); }
    .hero-stat-label {
      font-size: 12px;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      font-weight: 600;
    }
    .meter-wrapper {
      margin-bottom: 20px;
    }
    .meter-label {
      display: flex;
      justify-content: space-between;
      margin-bottom: 8px;
      font-size: 13px;
      color: var(--muted);
    }
    .meter-label strong {
      color: var(--ink);
      font-weight: 660;
    }

    /* Entry list */
    .entries {
      display: grid;
      gap: 12px;
    }
    .entry {
      border: 1px solid var(--line);
      border-radius: var(--radius);
      background: var(--panel);
      padding: 16px;
      box-shadow: var(--shadow);
      transition: border-color 0.15s ease;
    }
    .entry:hover {
      border-color: var(--line-strong);
    }
    .entry-header {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 12px;
    }
    .entry-title {
      flex: 1;
      min-width: 0;
    }
    .entry-title a {
      font-size: 15px;
      font-weight: 640;
      color: var(--ink);
    }
    .entry-title a:hover {
      color: var(--accent);
    }
    .entry-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 10px;
      font-size: 12px;
      color: var(--muted);
      font-family: var(--font-mono);
    }
    .entry-meta > span {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .entry-paths {
      margin-top: 8px;
      padding-top: 12px;
      border-top: 1px solid var(--line);
    }
    .entry-path {
      font-size: 12px;
      color: var(--faint);
      font-family: var(--font-mono);
      margin-bottom: 4px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .entry-commands {
      margin-top: 12px;
      padding: 10px;
      background: var(--canvas);
      border-radius: var(--radius-xs);
      font-size: 11.5px;
      font-family: var(--font-mono);
      color: var(--muted);
    }
    .entry-commands > div {
      margin-bottom: 3px;
    }
    .entry-commands > div:last-child {
      margin-bottom: 0;
    }
    .entry-failed-artifacts {
      margin-top: 12px;
      padding: 10px;
      background: var(--fail-soft);
      border-radius: var(--radius-xs);
      border: 1px solid color-mix(in oklab, var(--fail) 25%, var(--line));
    }
    .entry-failed-artifacts > div {
      margin-bottom: 6px;
      font-size: 12px;
    }
    .entry-failed-artifacts > div:last-child {
      margin-bottom: 0;
    }
    .entry-errors {
      margin-top: 12px;
      padding: 10px;
      background: var(--fail-soft);
      border-radius: var(--radius-xs);
      border: 1px solid color-mix(in oklab, var(--fail) 25%, var(--line));
      color: var(--fail);
      font-size: 12px;
      font-family: var(--font-mono);
    }
    </style>
  </head>
  <body>
    <div class="rail ${ok ? "pass" : "fail"}"></div>
    <div class="shell">
      <div class="hero">
        <div class="hero-title">
          <h1>Agent Replay Report</h1>
          <div class="statusline ${ok ? "pass" : "fail"}">
            <span class="dot"></span>
            <span>${ok ? "PASSED" : "FAILED"}</span>
          </div>
        </div>

        <div class="hero-stats">
          <div class="hero-stat">
            <div class="hero-stat-value">${args.entries.length}</div>
            <div class="hero-stat-label">Total Entries</div>
          </div>
          <div class="hero-stat">
            <div class="hero-stat-value pass">${passCount}</div>
            <div class="hero-stat-label">Passed</div>
          </div>
          <div class="hero-stat">
            <div class="hero-stat-value fail">${failCount}</div>
            <div class="hero-stat-label">Failed</div>
          </div>
          <div class="hero-stat">
            <div class="hero-stat-value">${passRate.toFixed(1)}%</div>
            <div class="hero-stat-label">Pass Rate</div>
          </div>
        </div>

        <div class="meter-wrapper">
          <div class="meter-label">
            <span><strong>${passCount}</strong> passed</span>
            <span><strong>${failCount}</strong> failed</span>
          </div>
          <div class="meter ${failCount > 0 ? "has-fail" : ""}">
            <i style="width: ${passRate}%"></i>
          </div>
        </div>

        <div class="chip-row">
          <span class="chip mono">${escapeHtml(args.dir)}</span>
          <span class="chip">${args.updateSnapshots ? "Update Snapshots" : "Compare Snapshots"}</span>
          <span class="chip">${args.durationMs}ms</span>
          <a class="chip" href="${escapeAttribute(relativeHref(path, args.summaryPath))}">
            📄 summary.json
          </a>
        </div>
      </div>

      <section class="entries">
        ${rows || '<div class="panel"><p style="color: var(--muted); margin: 0;">No replay artifacts were found.</p></div>'}
      </section>
    </div>
  </body>
</html>`,
    "utf8",
  );
}

function renderEntry(entry: AgentReplayAllEntry, reportPath: string): string {
  const state = entry.result.ok ? "pass" : "fail";
  const source = entry.result.replaySourceCassettePath ?? entry.result.cassettePath;
  const failedArtifacts = entry.result.artifacts.filter((artifact) => !artifact.ok);

  return `<article class="entry">
    <div class="entry-header">
      <span class="dot-sm ${state}"></span>
      <div class="entry-title">
        <a href="${escapeAttribute(relativeHref(reportPath, entry.result.reportPath))}">${escapeHtml(entry.result.name)}</a>
        <div class="entry-meta">
          <span>📊 ${entry.result.mode}</span>
          <span>🎞️ ${entry.result.cassetteFrameCount} frames</span>
          <span>⏱️ ${entry.durationMs}ms</span>
        </div>
      </div>
      <div class="statusline ${state}">
        <span class="dot"></span>
        <span>${state.toUpperCase()}</span>
      </div>
    </div>

    <div class="entry-paths">
      <div class="entry-path" title="${escapeAttribute(entry.filePath)}">📁 ${escapeHtml(entry.filePath)}</div>
      <div class="entry-path" title="${escapeAttribute(source)}">🎬 ${escapeHtml(source)}</div>
    </div>

    ${
      failedArtifacts.length > 0
        ? `<div class="entry-failed-artifacts">
      <strong style="display: block; margin-bottom: 8px; color: var(--fail);">⚠️ Failed Artifacts (${failedArtifacts.length})</strong>
      ${failedArtifacts.map((artifact) => renderFailedArtifact(artifact, reportPath)).join("")}
    </div>`
        : ""
    }

    ${
      entry.result.errors.length > 0
        ? `<div class="entry-errors">
      <strong style="display: block; margin-bottom: 6px;">❌ Errors</strong>
      ${entry.result.errors.map((error) => `<div>${escapeHtml(error)}</div>`).join("")}
    </div>`
        : ""
    }

    <details class="entry-commands">
      <summary style="cursor: pointer; font-weight: 600; color: var(--ink); margin-bottom: 8px;">🔧 Commands</summary>
      <div><strong>Replay:</strong> ${escapeHtml(formatAgentArgv(entry.result.commands.replay.argv))}</div>
      <div><strong>Update:</strong> ${escapeHtml(formatAgentArgv(entry.result.commands.updateSnapshots.argv))}</div>
      <div><strong>Commands:</strong> ${escapeHtml(
        formatAgentArgv(["ptywright", "agent", "commands", entry.result.recordPath, "--json"]),
      )}</div>
    </details>
  </article>`;
}

function renderFailedArtifact(
  artifact: AgentRunResult["artifacts"][number],
  reportPath: string,
): string {
  const diffLink = artifact.diffPath
    ? ` · <a href="${escapeAttribute(relativeHref(reportPath, artifact.diffPath))}" style="color: var(--changed);">view diff</a>`
    : "";
  const artifactLink = `<a href="${escapeAttribute(relativeHref(reportPath, artifact.path))}">${escapeHtml(artifact.kind)}</a>`;
  const errorMsg = artifact.error
    ? ` <span style="color: var(--fail);">· ${escapeHtml(artifact.error)}</span>`
    : "";

  return `<div style="padding: 6px 0; border-bottom: 1px solid var(--line); font-size: 12px;">
    <div style="margin-bottom: 3px;">
      ${artifactLink}${diffLink}
    </div>
    <div style="color: var(--muted); font-family: var(--font-mono); font-size: 11px;">
      ${escapeHtml(artifact.viewport)} · ${escapeHtml(artifact.name)}${errorMsg}
    </div>
  </div>`;
}
