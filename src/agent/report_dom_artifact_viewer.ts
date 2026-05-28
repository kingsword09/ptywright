import { escapeAttribute } from "./html_escape";
import type { AgentReportArtifactViewerFragment } from "./report_artifact_viewer_fragment";
import { relativeHref } from "./report_paths";
import type { AgentReportViewOptions } from "./report_view_options";

export type AgentReportDomPreview = {
  path: string;
};

export function resolveReportDomPreview(
  path: string | null | undefined,
): AgentReportDomPreview | null {
  return path ? { path } : null;
}

function renderDomArtifactViewer(args: {
  artifactsDir: string;
  mobile: boolean;
  preview: AgentReportDomPreview;
  viewerPath: string;
  viewOptions: AgentReportViewOptions;
}): string {
  const { artifactsDir, mobile, preview, viewerPath, viewOptions } = args;
  const src = relativeHref(viewerPath, preview.path, artifactsDir);

  return `<div class="viewer-viewport dom-viewport" data-mobile="${mobile ? "true" : "false"}" data-screen-mode="${escapeAttribute(viewOptions.screenMode)}"><iframe class="dom-viewer-frame" sandbox="allow-same-origin allow-scripts" src="${escapeAttribute(src)}" title="terminal DOM artifact"></iframe></div>`;
}

export function renderDomArtifactViewerFragment(args: {
  artifactsDir: string;
  mobile: boolean;
  preview: AgentReportDomPreview;
  viewerPath: string;
  viewOptions: AgentReportViewOptions;
}): AgentReportArtifactViewerFragment {
  return {
    css: "",
    html: renderDomArtifactViewer(args),
    script: "",
  };
}
