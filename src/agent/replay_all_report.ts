import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { relativeHref } from "../common/path";
import { formatAgentArgv } from "./run_record";
import type { AgentReplayAllEntry } from "./replay_all_types";
import type { AgentRunResult } from "./runner";
import { escapeAttribute, escapeHtml } from "./html_escape";

export function renderFailedEntryReport(result: AgentRunResult): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(result.name)} failed replay</title>
    <style>
      :root { color-scheme: light; font-family: ui-sans-serif, system-ui, sans-serif; }
      body { margin: 0; padding: 32px; background: oklch(97.5% 0.008 210); color: oklch(19% 0.018 230); }
      main { display: grid; gap: 16px; max-width: 960px; }
      pre { overflow: auto; border-radius: 8px; background: oklch(20% 0.015 230); color: oklch(92% 0.012 230); padding: 14px; }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(result.name)}</h1>
      <p>Replay failed before the agent runner could start.</p>
      <pre>${escapeHtml(result.errors.join("\n"))}</pre>
    </main>
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
  const rows = args.entries.map((entry) => renderEntry(entry, path)).join("\n");
  const ok = args.entries.every((entry) => entry.result.ok);

  writeFileSync(
    path,
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>ptywright agent replay report</title>
    <style>
      :root {
        color-scheme: light;
        --bg: oklch(97.5% 0.008 210);
        --ink: oklch(19% 0.018 230);
        --muted: oklch(48% 0.02 230);
        --line: oklch(86% 0.018 230);
        --panel: oklch(99% 0.006 210);
        --good: oklch(55% 0.15 155);
        --bad: oklch(58% 0.19 25);
        --focus: oklch(55% 0.14 235);
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      * { box-sizing: border-box; }
      body { margin: 0; background: var(--bg); color: var(--ink); }
      main {
        display: grid;
        gap: 22px;
        width: min(1180px, calc(100vw - 32px));
        margin: 0 auto;
        padding: 32px 0 48px;
      }
      header {
        display: grid;
        gap: 10px;
        border-bottom: 1px solid var(--line);
        padding-bottom: 20px;
      }
      h1 { margin: 0; font-size: 28px; line-height: 1.15; letter-spacing: 0; }
      .meta { display: flex; flex-wrap: wrap; gap: 8px; }
      .pill {
        display: inline-flex;
        min-height: 32px;
        align-items: center;
        border: 1px solid var(--line);
        border-radius: 999px;
        padding: 0 12px;
        color: var(--muted);
        font-size: 13px;
      }
      .pill.pass { color: var(--good); border-color: color-mix(in oklch, var(--good) 42%, var(--line)); }
      .pill.fail { color: var(--bad); border-color: color-mix(in oklch, var(--bad) 42%, var(--line)); }
      .entries { display: grid; gap: 10px; }
      .entry {
        display: grid;
        grid-template-columns: 92px minmax(0, 1fr) auto;
        gap: 14px;
        align-items: center;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--panel);
        padding: 12px;
      }
      .badge {
        justify-self: start;
        border-radius: 999px;
        padding: 5px 9px;
        background: color-mix(in oklch, var(--line) 52%, transparent);
        color: var(--muted);
        font-size: 12px;
        font-weight: 700;
      }
      .badge.pass { background: color-mix(in oklch, var(--good) 12%, var(--panel)); color: var(--good); }
      .badge.fail { background: color-mix(in oklch, var(--bad) 12%, var(--panel)); color: var(--bad); }
      a { color: var(--focus); font-weight: 700; text-decoration: none; }
      code { color: var(--muted); overflow-wrap: anywhere; }
      .commands {
        display: grid;
        gap: 4px;
        margin-top: 8px;
      }
      .commands code {
        display: block;
      }
      @media (max-width: 720px) {
        main { width: min(100vw - 20px, 1180px); padding-top: 18px; }
        .entry { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <h1>ptywright agent replay report</h1>
        <div class="meta">
          <span class="pill ${ok ? "pass" : "fail"}">${ok ? "passed" : "failed"}</span>
          <span class="pill">${args.entries.length} entries</span>
          <span class="pill">${args.updateSnapshots ? "update snapshots" : "compare snapshots"}</span>
          <span class="pill">${args.durationMs}ms</span>
          <span class="pill">${escapeHtml(args.dir)}</span>
          <a class="pill" href="${escapeAttribute(relativeHref(path, args.summaryPath))}">agent-replay.summary.json</a>
        </div>
      </header>
      <section class="entries">
        ${rows || "<p>No replay artifacts were found.</p>"}
      </section>
    </main>
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
    <span class="badge ${state}">${state}</span>
    <div>
      <a href="${escapeAttribute(relativeHref(reportPath, entry.result.reportPath))}">${escapeHtml(entry.result.name)}</a>
      <div><code>${escapeHtml(entry.filePath)}</code></div>
      <div><code>${escapeHtml(source)}</code></div>
      <div class="commands">
        <code>replay ${escapeHtml(formatAgentArgv(entry.result.commands.replay.argv))}</code>
        <code>update ${escapeHtml(formatAgentArgv(entry.result.commands.updateSnapshots.argv))}</code>
        <code>commands ${escapeHtml(
          formatAgentArgv(["ptywright", "agent", "commands", entry.result.recordPath, "--json"]),
        )}</code>
      </div>
      ${failedArtifacts.map((artifact) => renderFailedArtifact(artifact, reportPath)).join("")}
      ${entry.result.errors.map((error) => `<div><code>${escapeHtml(error)}</code></div>`).join("")}
    </div>
    <code>${entry.result.mode} / ${entry.result.cassetteFrameCount} frames / ${entry.durationMs}ms</code>
  </article>`;
}

function renderFailedArtifact(
  artifact: AgentRunResult["artifacts"][number],
  reportPath: string,
): string {
  const diffLink = artifact.diffPath
    ? `<a href="${escapeAttribute(relativeHref(reportPath, artifact.diffPath))}">diff</a>`
    : "";
  const artifactLink = `<a href="${escapeAttribute(relativeHref(reportPath, artifact.path))}">${escapeHtml(artifact.kind)}</a>`;
  return `<div>
    ${artifactLink}${diffLink ? ` ${diffLink}` : ""}
    <code>${escapeHtml(artifact.viewport)} / ${escapeHtml(artifact.name)}${artifact.error ? ` / ${artifact.error}` : ""}</code>
  </div>`;
}
