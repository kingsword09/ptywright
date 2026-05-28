import type { AgentViewport } from "./schema";
import { escapeAttribute } from "./html_escape";
import {
  type AgentReportAittyViewerAssets,
  renderAittyPreviewAssetTags,
  renderAittyPreviewBody,
  renderAittyPreviewCss,
} from "./report_aitty_preview";
import { resolveTerminalSnapshotLayout } from "./report_terminal_layout";
import type { AgentReportViewOptions } from "./report_view_options";

export function renderDomPreviewDocument(
  snapshot: string,
  viewport: AgentViewport | undefined,
  viewOptions: AgentReportViewOptions,
  aittyAssets: AgentReportAittyViewerAssets,
): string {
  const snapshotLayout = resolveTerminalSnapshotLayout(snapshot, viewport, viewOptions);
  const body = renderAittyPreviewBody({ snapshot, snapshotLayout, viewOptions });
  const style = renderAittyPreviewCss(viewOptions);
  const assetTags = renderAittyPreviewAssetTags(aittyAssets);

  return `<!doctype html>
<html lang="en" data-theme="${escapeAttribute(viewOptions.theme)}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
${assetTags}    <style>
${style}
    </style>
  </head>
  <body>
${body}
  </body>
</html>`;
}
