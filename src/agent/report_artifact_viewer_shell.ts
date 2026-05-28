import { escapeAttribute, escapeHtml } from "./html_escape";
import type { AgentReportArtifactViewerFragment } from "./report_artifact_viewer_fragment";
import { renderArtifactViewerShellCss } from "./report_artifact_viewer_shell_css";
import { relativeHref } from "./report_paths";
import type { AgentReportViewOptions } from "./report_view_options";
import type { AgentRunArtifact } from "./runner";
import type { AgentViewport } from "./schema";

export function renderArtifactViewerShellHtml(args: {
  artifact: AgentRunArtifact;
  artifactsDir: string;
  contentFragment: AgentReportArtifactViewerFragment;
  mobile: boolean;
  reportPath: string;
  viewOptions: AgentReportViewOptions;
  viewerPath: string;
  viewport?: AgentViewport;
}): string {
  const { artifact, artifactsDir, contentFragment, mobile, reportPath, viewOptions, viewerPath } =
    args;
  const title = `${artifact.viewport} ${artifact.name} ${artifact.kind}`;
  const viewportStyle = renderConfiguredViewportStyle(args.viewport);
  const viewportLabel = args.viewport
    ? `${args.viewport.name} ${args.viewport.width}x${args.viewport.height}`
    : `${artifact.viewport} viewport`;
  const backHref = relativeHref(viewerPath, reportPath, artifactsDir);
  const rawHref = relativeHref(viewerPath, artifact.path, artifactsDir);
  const baselineHref = artifact.baselinePath
    ? relativeHref(viewerPath, artifact.baselinePath, artifactsDir)
    : "";
  const diffHref = artifact.diffPath
    ? relativeHref(viewerPath, artifact.diffPath, artifactsDir)
    : "";
  const scriptTag = contentFragment.script
    ? `    <script>
${contentFragment.script}
    </script>
`
    : "";

  return `<!doctype html>
<html lang="en" data-theme="${escapeAttribute(viewOptions.theme)}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
${renderArtifactViewerShellCss()}
${contentFragment.css}
    </style>
  </head>
  <body>
    <main class="viewer-page" data-report-screen-mode="${escapeAttribute(viewOptions.screenMode)}" data-theme="${escapeAttribute(viewOptions.theme)}" style="${escapeAttribute(viewportStyle)}">
      <header class="viewer-toolbar">
        <a class="viewer-link" href="${escapeAttribute(backHref)}">Report</a>
        <span class="viewer-title">${escapeHtml(title)}</span>
        <span class="viewer-pill">${escapeHtml(viewportLabel)}</span>
        <span class="viewer-pill">${escapeHtml(viewOptions.screenMode)}</span>
        <a class="viewer-link" href="${escapeAttribute(rawHref)}">Raw</a>
        ${baselineHref ? `<a class="viewer-link" href="${escapeAttribute(baselineHref)}">Baseline</a>` : ""}
        ${diffHref ? `<a class="viewer-link" href="${escapeAttribute(diffHref)}">Diff</a>` : ""}
      </header>
      <section class="viewer-stage" data-mobile="${mobile ? "true" : "false"}">
        ${contentFragment.html}
      </section>
    </main>
${scriptTag}
  </body>
</html>`;
}

function renderConfiguredViewportStyle(viewport?: AgentViewport): string {
  if (!viewport) {
    return "--config-viewport-width: 1280px; --config-viewport-height: 760px;";
  }
  return `--config-viewport-width: ${viewport.width}px; --config-viewport-height: ${viewport.height}px;`;
}
