import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { formatAgentArgv } from "./run_record";
import type { AgentRunArtifact, AgentRunResult } from "./runner";

export function writeAgentReport(path: string, result: AgentRunResult): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, renderAgentReportHtml(result), "utf8");
}

export function renderAgentReportHtml(result: AgentRunResult): string {
  const artifacts = result.artifacts
    .map((artifact) => renderArtifactRow(artifact, result.artifactsDir, result.reportPath))
    .join("\n");
  const viewportTabs = result.viewports
    .map(
      (viewport) =>
        `<span class="pill">${escapeHtml(viewport.name)} ${viewport.width}x${viewport.height}</span>`,
    )
    .join("");
  const status = result.ok ? "passed" : "failed";
  const title = `${result.name} terminal-agent report`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
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
        font-family:
          ui-sans-serif,
          system-ui,
          -apple-system,
          BlinkMacSystemFont,
          "Segoe UI",
          sans-serif;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: var(--bg);
        color: var(--ink);
      }
      main {
        display: grid;
        gap: 24px;
        width: min(1180px, calc(100vw - 32px));
        margin: 0 auto;
        padding: 32px 0 48px;
      }
      header {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 20px;
        align-items: start;
        border-bottom: 1px solid var(--line);
        padding-bottom: 24px;
      }
      h1 {
        margin: 0;
        font-size: 28px;
        line-height: 1.15;
        letter-spacing: 0;
      }
      h2 {
        margin: 0;
        font-size: 18px;
        line-height: 1.25;
      }
      .meta {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 12px;
      }
      .pill,
      .status {
        display: inline-flex;
        min-height: 32px;
        align-items: center;
        border: 1px solid var(--line);
        border-radius: 999px;
        padding: 0 12px;
        color: var(--muted);
        font-size: 13px;
      }
      .status {
        border-color: ${result.ok ? "color-mix(in oklch, var(--good) 42%, var(--line))" : "color-mix(in oklch, var(--bad) 44%, var(--line))"};
        color: ${result.ok ? "var(--good)" : "var(--bad)"};
        font-weight: 700;
      }
      .panel {
        display: grid;
        gap: 16px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--panel);
        padding: 18px;
      }
      .summary {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 12px;
      }
      .metric {
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 14px;
        background: color-mix(in oklch, var(--panel) 82%, var(--bg));
      }
      .metric strong {
        display: block;
        font-size: 24px;
        line-height: 1.1;
      }
      .metric span {
        display: block;
        margin-top: 4px;
        color: var(--muted);
        font-size: 13px;
      }
      .artifacts {
        display: grid;
        gap: 10px;
      }
      .artifact {
        display: grid;
        grid-template-columns: 120px minmax(0, 1fr) auto;
        gap: 14px;
        align-items: center;
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 12px;
        background: var(--panel);
      }
      .artifact a {
        color: var(--focus);
        font-weight: 700;
        text-decoration: none;
      }
      .artifact code,
      pre {
        font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
      }
      .artifact code {
        color: var(--muted);
        overflow-wrap: anywhere;
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
      .badge.fail {
        background: color-mix(in oklch, var(--bad) 12%, var(--panel));
        color: var(--bad);
      }
      .badge.pass {
        background: color-mix(in oklch, var(--good) 12%, var(--panel));
        color: var(--good);
      }
      .commands {
        display: grid;
        gap: 10px;
      }
      .command {
        display: grid;
        gap: 5px;
      }
      .command span {
        color: var(--muted);
        font-size: 13px;
        font-weight: 700;
      }
      pre {
        overflow: auto;
        margin: 0;
        border-radius: 8px;
        background: oklch(20% 0.015 230);
        color: oklch(92% 0.012 230);
        padding: 14px;
        line-height: 1.5;
      }
      @media (max-width: 720px) {
        main {
          width: min(100vw - 20px, 1180px);
          padding-top: 18px;
        }
        header,
        .artifact {
          grid-template-columns: 1fr;
        }
        .status {
          justify-self: start;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <div>
          <h1>${escapeHtml(result.name)}</h1>
          <div class="meta">
            <span class="status">${status}</span>
            <span class="pill">${escapeHtml(result.mode)}</span>
            <span class="pill">${escapeHtml(result.agentFlavor)}</span>
            ${viewportTabs}
            <span class="pill">${escapeHtml(new Date(result.startedAt).toISOString())}</span>
          </div>
        </div>
      </header>

      <section class="summary">
        <div class="metric"><strong>${result.steps.length}</strong><span>Recorded steps</span></div>
        <div class="metric"><strong>${result.artifacts.length}</strong><span>Snapshot artifacts</span></div>
        <div class="metric"><strong>${result.cassetteFrameCount}</strong><span>Cassette frames</span></div>
        <div class="metric"><strong>${result.durationMs}ms</strong><span>Wall time</span></div>
      </section>

      <section class="panel">
        <h2>Commands</h2>
        <div class="commands">
          ${renderCommandBlock("replay", result.commands.replay.argv)}
          ${renderCommandBlock("update snapshots", result.commands.updateSnapshots.argv)}
          ${renderCommandBlock("inspect commands", [
            "ptywright",
            "agent",
            "commands",
            result.recordPath,
            "--json",
          ])}
        </div>
        <p><code>${escapeHtml(result.replaySourceCassettePath ?? result.cassettePath)}</code></p>
      </section>

      <section class="panel">
        <h2>Terminal Agent Artifacts</h2>
        <div class="artifacts">
          ${artifacts || "<p>No artifacts were captured.</p>"}
        </div>
      </section>
    </main>
  </body>
</html>`;
}

function renderCommandBlock(label: string, argv: readonly string[]): string {
  return `<div class="command">
    <span>${escapeHtml(label)}</span>
    <pre>${escapeHtml(formatAgentArgv(argv))}</pre>
  </div>`;
}

function renderArtifactRow(
  artifact: AgentRunArtifact,
  artifactsDir: string,
  reportPath: string,
): string {
  const state = artifact.ok ? "pass" : "fail";
  const href = relativeHref(reportPath, artifact.path, artifactsDir);
  const baselineHref = artifact.baselinePath
    ? relativeHref(reportPath, artifact.baselinePath, artifactsDir)
    : "";
  const diffHref = artifact.diffPath
    ? relativeHref(reportPath, artifact.diffPath, artifactsDir)
    : "";
  const screenshot =
    artifact.kind === "screenshot" && artifact.path
      ? `<a href="${escapeAttribute(href)}">open image</a>`
      : `<a href="${escapeAttribute(href)}">${escapeHtml(artifact.kind)}</a>`;

  return `<article class="artifact">
    <span class="badge ${state}">${state}</span>
    <div>
      ${screenshot}
      <div><code>${escapeHtml(artifact.viewport)} / ${escapeHtml(artifact.name)}</code></div>
      ${baselineHref ? `<div><code>baseline ${escapeHtml(baselineHref)}</code></div>` : ""}
      ${diffHref ? `<div><a href="${escapeAttribute(diffHref)}">diff</a></div>` : ""}
      ${artifact.error ? `<div><code>${escapeHtml(artifact.error)}</code></div>` : ""}
    </div>
    <code>${escapeHtml(artifact.hash ?? "")}</code>
  </article>`;
}

function relativeHref(_reportPath: string, targetPath: string, artifactsDir: string): string {
  if (targetPath.startsWith(artifactsDir)) {
    return targetPath.slice(artifactsDir.length).replace(/^\/+/, "");
  }
  return targetPath;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttribute(input: string): string {
  return escapeHtml(input).replace(/'/g, "&#39;");
}
