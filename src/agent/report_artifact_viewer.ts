import { renderArtifactViewerFragment } from "./report_artifact_viewer_fragment";
import { renderArtifactViewerShellHtml } from "./report_artifact_viewer_shell";
import type { AgentReportDomPreview } from "./report_dom_artifact_viewer";
import { isMobileViewport, type AgentReportViewOptions } from "./report_view_options";
import type { AgentRunArtifact } from "./runner";
import type { AgentViewport } from "./schema";

export function renderArtifactViewerHtml(args: {
  artifact: AgentRunArtifact;
  artifactsDir: string;
  content: string;
  domPreview: AgentReportDomPreview | null;
  reportPath: string;
  terminalDomPreview: AgentReportDomPreview | null;
  viewOptions: AgentReportViewOptions;
  viewerPath: string;
  viewport?: AgentViewport;
}): string {
  const {
    artifact,
    artifactsDir,
    content,
    domPreview,
    reportPath,
    terminalDomPreview,
    viewOptions,
    viewerPath,
    viewport,
  } = args;
  const mobile = isMobileViewport(viewport);
  const domViewerPreview =
    artifact.kind === "dom" ? domPreview : artifact.kind === "terminal" ? terminalDomPreview : null;
  const contentFragment = renderArtifactViewerFragment({
    artifactsDir,
    content,
    domViewerPreview,
    mobile,
    viewerPath,
    viewOptions,
  });

  return renderArtifactViewerShellHtml({
    artifact,
    artifactsDir,
    contentFragment,
    mobile,
    reportPath,
    viewOptions,
    viewerPath,
    viewport,
  });
}
