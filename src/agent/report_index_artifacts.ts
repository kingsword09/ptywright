import { escapeAttribute, escapeHtml } from "./html_escape";
import { artifactViewerPath } from "./report_artifact_paths";
import { relativeHref } from "./report_paths";
import type { AgentRunArtifact } from "./runner";

export function renderAgentReportArtifacts(args: {
  artifacts: readonly AgentRunArtifact[];
  artifactsDir: string;
  reportPath: string;
}): string {
  if (args.artifacts.length === 0) {
    return "<p>No artifacts were captured.</p>";
  }

  // Group artifacts by viewport
  const byViewport = new Map<string, AgentRunArtifact[]>();
  for (const artifact of args.artifacts) {
    const list = byViewport.get(artifact.viewport) ?? [];
    list.push(artifact);
    byViewport.set(artifact.viewport, list);
  }

  // Render each viewport group
  const viewportGroups = Array.from(byViewport.entries())
    .map(([viewport, artifacts]) =>
      renderViewportGroup({
        viewport,
        artifacts,
        artifactsDir: args.artifactsDir,
        reportPath: args.reportPath,
      }),
    )
    .join("\n");

  return viewportGroups;
}

function renderViewportGroup(args: {
  viewport: string;
  artifacts: AgentRunArtifact[];
  artifactsDir: string;
  reportPath: string;
}): string {
  const { viewport, artifacts, artifactsDir, reportPath } = args;

  // Group artifacts by name (status, ready, etc.)
  const byName = new Map<string, AgentRunArtifact[]>();
  for (const artifact of artifacts) {
    const list = byName.get(artifact.name) ?? [];
    list.push(artifact);
    byName.set(artifact.name, list);
  }

  const artifactRows = Array.from(byName.entries())
    .map(([name, artifacts]) =>
      renderArtifactGroup({
        name,
        artifacts,
        artifactsDir,
        reportPath,
      }),
    )
    .join("\n");

  return `<div class="viewport-group">
    <h3 class="viewport-title">${escapeHtml(viewport)}</h3>
    <div class="viewport-artifacts">
      ${artifactRows}
    </div>
  </div>`;
}

function renderArtifactGroup(args: {
  name: string;
  artifacts: AgentRunArtifact[];
  artifactsDir: string;
  reportPath: string;
}): string {
  const { name, artifacts, artifactsDir, reportPath } = args;

  // Render artifact chips (terminal, dom, layout, screenshot)
  const chips = artifacts
    .map((artifact) => {
      const state = artifact.ok ? "pass" : "fail";
      const viewerPath = artifactViewerPath(artifact);
      const href = viewerPath
        ? relativeHref(reportPath, viewerPath, artifactsDir)
        : relativeHref(reportPath, artifact.path, artifactsDir);

      return `<a href="${escapeAttribute(href)}" class="artifact-chip ${state}" title="${escapeHtml(artifact.kind)}">
        ${escapeHtml(artifact.kind)}
      </a>`;
    })
    .join("");

  // Find failed artifact for detailed view
  const failedArtifact = artifacts.find((a) => !a.ok);
  const detailView = failedArtifact
    ? renderFailedArtifactDetail({
        artifact: failedArtifact,
        artifactsDir,
        reportPath,
      })
    : "";

  return `<div class="artifact-group">
    <div class="artifact-group-header">
      <span class="artifact-name">${escapeHtml(name)}</span>
      <div class="artifact-chips">
        ${chips}
      </div>
    </div>
    ${detailView}
  </div>`;
}

function renderFailedArtifactDetail(args: {
  artifact: AgentRunArtifact;
  artifactsDir: string;
  reportPath: string;
}): string {
  const { artifact, artifactsDir, reportPath } = args;

  const currentHref = relativeHref(reportPath, artifact.path, artifactsDir);
  const baselineHref = artifact.baselinePath
    ? relativeHref(reportPath, artifact.baselinePath, artifactsDir)
    : "";
  const diffHref = artifact.diffPath
    ? relativeHref(reportPath, artifact.diffPath, artifactsDir)
    : "";

  // For DOM artifacts, render with device frame
  const isDom = artifact.kind === "dom";
  const isScreenshot = artifact.kind === "screenshot";

  if (isDom || isScreenshot) {
    return `<div class="artifact-detail">
      <div class="artifact-comparison">
        ${
          baselineHref
            ? `<div class="artifact-preview">
          <div class="artifact-preview-label">Baseline</div>
          <div class="device-frame">
            <iframe src="${escapeAttribute(baselineHref)}" loading="lazy" sandbox="allow-same-origin"></iframe>
          </div>
        </div>`
            : ""
        }
        <div class="artifact-preview">
          <div class="artifact-preview-label">Current</div>
          <div class="device-frame ${artifact.ok ? "" : "failed"}">
            <iframe src="${escapeAttribute(currentHref)}" loading="lazy" sandbox="allow-same-origin"></iframe>
          </div>
        </div>
        ${
          diffHref
            ? `<div class="artifact-preview">
          <div class="artifact-preview-label">Diff</div>
          <div class="device-frame diff">
            <iframe src="${escapeAttribute(diffHref)}" loading="lazy" sandbox="allow-same-origin"></iframe>
          </div>
        </div>`
            : ""
        }
      </div>
      ${
        artifact.error
          ? `<div class="artifact-error">
        <strong>Error:</strong> ${escapeHtml(artifact.error)}
      </div>`
          : ""
      }
      <div class="artifact-meta-row">
        <code class="artifact-hash">${escapeHtml(artifact.hash ?? "")}</code>
      </div>
    </div>`;
  }

  // For other artifacts, simple link display
  return `<div class="artifact-detail">
    <div class="artifact-links">
      <a href="${escapeAttribute(currentHref)}" class="btn">View Current</a>
      ${baselineHref ? `<a href="${escapeAttribute(baselineHref)}" class="btn">View Baseline</a>` : ""}
      ${diffHref ? `<a href="${escapeAttribute(diffHref)}" class="btn">View Diff</a>` : ""}
    </div>
    ${
      artifact.error
        ? `<div class="artifact-error">
      <strong>Error:</strong> ${escapeHtml(artifact.error)}
    </div>`
        : ""
    }
    <div class="artifact-meta-row">
      <code class="artifact-hash">${escapeHtml(artifact.hash ?? "")}</code>
    </div>
  </div>`;
}
