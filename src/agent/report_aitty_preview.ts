import { escapeAttribute } from "./html_escape";
import type { AgentReportAittyAssets } from "./aitty_report_assets";
import { relativeHref } from "./report_paths";
import type { TerminalSnapshotLayout } from "./report_terminal_layout";
import type { AgentReportViewOptions } from "./report_view_options";

export type AgentReportAittyViewerAssets = {
  scriptHref: string;
  scriptType: "classic" | "module";
  styleHref: string;
};

export function resolveAittyPreviewAssets(
  previewPath: string,
  assets: AgentReportAittyAssets,
  artifactsDir: string,
): AgentReportAittyViewerAssets {
  return {
    scriptHref: relativeHref(previewPath, assets.scriptPath, artifactsDir),
    scriptType: assets.scriptType,
    styleHref: relativeHref(previewPath, assets.stylePath, artifactsDir),
  };
}

export function renderAittyPreviewAssetTags(assets: AgentReportAittyViewerAssets): string {
  return `    <link rel="stylesheet" href="${escapeAttribute(assets.styleHref)}" />
    <script${assets.scriptType === "module" ? ' type="module"' : ""} src="${escapeAttribute(assets.scriptHref)}"></script>
`;
}

export function renderAittyPreviewBody(args: {
  snapshot: string;
  snapshotLayout: TerminalSnapshotLayout;
  viewOptions: AgentReportViewOptions;
}): string {
  const { snapshot, snapshotLayout, viewOptions } = args;

  return `    <aitty-snapshot
      cols="${snapshotLayout.cols}"
      rows="${snapshotLayout.rows}"
      screen-mode="${escapeAttribute(viewOptions.screenMode)}"
      theme="${escapeAttribute(viewOptions.theme)}"
      font-size="${snapshotLayout.fontSize}"
      line-height="${snapshotLayout.lineHeight}"
    >${snapshot}</aitty-snapshot>`;
}

// The <aitty-snapshot> custom element ships its own wterm appearance, ANSI
// palette, and viewport-pan behavior via @aitty/snapshot/style.css. The report
// page only needs to make the host fill the iframe and respect safe-area on
// mobile; everything else (cell metrics, scrollbars, themes) is owned by aitty.
export function renderAittyPreviewCss(viewOptions: AgentReportViewOptions): string {
  return `      :root {
        color-scheme: ${viewOptions.theme};
      }
      html,
      body {
        width: 100%;
        height: 100%;
        margin: 0;
        background: var(--theme-term-bg, Canvas);
      }
      aitty-snapshot {
        display: block;
        width: 100%;
        height: 100%;
      }`;
}
