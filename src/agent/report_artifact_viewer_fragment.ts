import {
  type AgentReportDomPreview,
  renderDomArtifactViewerFragment,
} from "./report_dom_artifact_viewer";
import { renderRawArtifactViewerFragment } from "./report_raw_artifact_viewer";
import type { AgentReportViewOptions } from "./report_view_options";

export type AgentReportArtifactViewerFragment = {
  css: string;
  html: string;
  script: string;
};

export function renderArtifactViewerFragment(args: {
  artifactsDir: string;
  content: string;
  domViewerPreview: AgentReportDomPreview | null;
  mobile: boolean;
  viewerPath: string;
  viewOptions: AgentReportViewOptions;
}): AgentReportArtifactViewerFragment {
  const { artifactsDir, content, domViewerPreview, mobile, viewerPath, viewOptions } = args;

  if (domViewerPreview) {
    return renderDomArtifactViewerFragment({
      artifactsDir,
      mobile,
      preview: domViewerPreview,
      viewerPath,
      viewOptions,
    });
  }

  return renderRawArtifactViewerFragment({ content, mobile, viewOptions });
}
