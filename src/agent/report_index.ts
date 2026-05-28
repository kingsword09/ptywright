import { escapeHtml } from "./html_escape";
import { renderAgentReportArtifacts } from "./report_index_artifacts";
import { renderAgentReportCommandBlock } from "./report_index_commands";
import { renderAgentReportCss } from "./report_index_css";
import type { AgentRunResult } from "./runner";

export function renderAgentReportHtml(result: AgentRunResult): string {
  const artifacts = renderAgentReportArtifacts({
    artifacts: result.artifacts,
    artifactsDir: result.artifactsDir,
    reportPath: result.reportPath,
  });
  const viewportTabs = result.viewports
    .map(
      (viewport) =>
        `<span class="pill">${escapeHtml(viewport.name)} ${viewport.width}x${viewport.height}</span>`,
    )
    .join("");
  const status = result.ok ? "passed" : "failed";
  const statusClass = result.ok ? "pass" : "fail";
  const title = `${result.name} terminal-agent report`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
${renderAgentReportCss()}
    </style>
  </head>
  <body>
    <main>
      <header>
        <div>
          <h1>${escapeHtml(result.name)}</h1>
          <div class="meta">
            <span class="status ${statusClass}">${status}</span>
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
          ${renderAgentReportCommandBlock("replay", result.commands.replay.argv)}
          ${renderAgentReportCommandBlock("update snapshots", result.commands.updateSnapshots.argv)}
          ${renderAgentReportCommandBlock("inspect commands", [
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
          ${artifacts}
        </div>
      </section>
    </main>
  </body>
</html>`;
}
