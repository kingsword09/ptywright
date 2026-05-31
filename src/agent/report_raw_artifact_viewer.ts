import { escapeAttribute } from "./html_escape";
import type { AgentReportArtifactViewerFragment } from "./report_artifact_viewer_fragment";
import { renderRawAnsiTextHtml } from "./report_raw_ansi_text";
import type { AgentReportViewOptions } from "./report_view_options";
import { renderReportViewportPanCss, renderReportViewportPanScript } from "./report_viewer_pan";

function renderRawArtifactViewer(
  content: string,
  mobile: boolean,
  viewOptions: AgentReportViewOptions,
): string {
  return `<div class="viewer-viewport raw-artifact-viewport" data-mobile="${mobile ? "true" : "false"}" data-screen-mode="${escapeAttribute(viewOptions.screenMode)}"><pre class="raw-artifact-text">${renderRawAnsiTextHtml(content)}</pre></div>`;
}

function renderRawArtifactViewerCss(): string {
  return `      .raw-artifact-text {
        min-width: 100%;
        width: max-content;
        min-height: 100%;
        margin: 0;
        background: var(--panel);
        color: var(--ink);
        font-family: var(--font-mono);
        font-size: 13px;
        line-height: 1.45;
        overflow: visible;
        padding: 12px;
        white-space: pre;
      }
${renderReportViewportPanCss()}`;
}

function renderRawArtifactViewerScript(): string {
  return renderReportViewportPanScript(`
        document.querySelectorAll(".raw-artifact-viewport").forEach((viewport) => {
          enableViewportPan(viewport);
          if (viewport.getAttribute("data-screen-mode") === "termvision") {
            requestAnimationFrame(() => scrollToBottom(viewport));
          }
        });
`);
}

export function renderRawArtifactViewerFragment(args: {
  content: string;
  mobile: boolean;
  viewOptions: AgentReportViewOptions;
}): AgentReportArtifactViewerFragment {
  const { content, mobile, viewOptions } = args;

  return {
    css: renderRawArtifactViewerCss(),
    html: renderRawArtifactViewer(content, mobile, viewOptions),
    script: renderRawArtifactViewerScript(),
  };
}
