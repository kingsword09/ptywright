import { escapeAttribute, escapeHtml } from "./html_escape";
import { artifactViewerPath } from "./report_artifact_paths";
import { relativeHref } from "./report_paths";
import type { AgentRunArtifact } from "./runner";

export function renderAgentReportArtifacts(args: {
  artifacts: readonly AgentRunArtifact[];
  artifactsDir: string;
  reportPath: string;
}): string {
  const rows = args.artifacts
    .map((artifact) =>
      renderArtifactRow({
        artifact,
        artifactsDir: args.artifactsDir,
        reportPath: args.reportPath,
      }),
    )
    .join("\n");

  return rows || "<p>No artifacts were captured.</p>";
}

function renderArtifactRow(args: {
  artifact: AgentRunArtifact;
  artifactsDir: string;
  reportPath: string;
}): string {
  const { artifact, artifactsDir, reportPath } = args;
  const state = artifact.ok ? "pass" : "fail";
  const href = relativeHref(reportPath, artifact.path, artifactsDir);
  const baselineHref = artifact.baselinePath
    ? relativeHref(reportPath, artifact.baselinePath, artifactsDir)
    : "";
  const diffHref = artifact.diffPath
    ? relativeHref(reportPath, artifact.diffPath, artifactsDir)
    : "";
  const viewerPath = artifactViewerPath(artifact);
  const viewerHref = viewerPath ? relativeHref(reportPath, viewerPath, artifactsDir) : "";
  const primaryHref = viewerHref || href;

  return `<article class="artifact">
    <div class="artifact-summary">
      <span class="badge ${state}">${state}</span>
      <div class="artifact-meta">
        <div class="artifact-links">
          <a href="${escapeAttribute(primaryHref)}">${escapeHtml(artifact.kind)}</a>
          ${viewerHref ? `<a href="${escapeAttribute(href)}">raw</a>` : ""}
          ${baselineHref ? `<a href="${escapeAttribute(baselineHref)}">baseline</a>` : ""}
          ${diffHref ? `<a href="${escapeAttribute(diffHref)}">diff</a>` : ""}
        </div>
      <div><code>${escapeHtml(artifact.viewport)} / ${escapeHtml(artifact.name)}</code></div>
      ${artifact.error ? `<div><code>${escapeHtml(artifact.error)}</code></div>` : ""}
      </div>
      <code class="artifact-hash">${escapeHtml(artifact.hash ?? "")}</code>
    </div>
  </article>`;
}
