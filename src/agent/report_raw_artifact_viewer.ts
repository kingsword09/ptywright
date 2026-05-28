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
        background:
          linear-gradient(180deg, color-mix(in srgb, #162033 92%, black), #0c111d);
        color: #e6edf7;
        font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, "Liberation Mono", monospace;
        font-size: 13px;
        line-height: 1.45;
        overflow: visible;
        padding: 12px;
        white-space: pre;
      }
      .viewer-page[data-theme="light"] .raw-artifact-text {
        background: #ffffff;
        color: #4c4f69;
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
