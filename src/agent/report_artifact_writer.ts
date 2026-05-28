import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { prepareAittyReportAssets } from "./aitty_report_assets";
import { resolveAittyPreviewAssets } from "./report_aitty_preview";
import {
  artifactDomPreviewPath,
  artifactSnapshotKey,
  artifactViewerPath,
} from "./report_artifact_paths";
import { renderArtifactViewerHtml } from "./report_artifact_viewer";
import { resolveReportDomPreview } from "./report_dom_artifact_viewer";
import { renderDomPreviewDocument } from "./report_terminal_preview";
import { resolveReportViewOptions } from "./report_view_options";
import type { AgentRunArtifact, AgentRunResult } from "./runner";

type AgentReportReadableArtifact = {
  artifact: AgentRunArtifact;
  content: string;
  viewerPath: string;
};

export function writeArtifactViewerPages(result: AgentRunResult): void {
  const viewportsByName = new Map(result.viewports.map((viewport) => [viewport.name, viewport]));
  const viewOptions = resolveReportViewOptions(result);
  const readableArtifacts: AgentReportReadableArtifact[] = [];

  for (const artifact of result.artifacts) {
    const viewerPath = artifactViewerPath(artifact);
    if (!viewerPath) continue;

    const content = readArtifactText(artifact.path);
    if (content === null) continue;

    readableArtifacts.push({ artifact, content, viewerPath });
  }

  const domPreviewPathsBySnapshot = new Map(
    readableArtifacts
      .filter(({ artifact }) => artifact.kind === "dom")
      .map(({ artifact }) => [artifactSnapshotKey(artifact), artifactDomPreviewPath(artifact)]),
  );

  const aittyAssets =
    domPreviewPathsBySnapshot.size > 0
      ? prepareAittyReportAssets({
          artifactsDir: result.artifactsDir,
          flowPath: result.flowPath,
          reportPath: result.reportPath,
        })
      : null;
  const writtenDomPreviewPaths = new Set<string>();

  if (aittyAssets) {
    for (const { artifact, content } of readableArtifacts) {
      if (artifact.kind !== "dom") continue;

      const viewport = viewportsByName.get(artifact.viewport);
      const domPreviewPath = artifactDomPreviewPath(artifact);
      mkdirSync(dirname(domPreviewPath), { recursive: true });
      writeFileSync(
        domPreviewPath,
        renderDomPreviewDocument(
          content,
          viewport,
          viewOptions,
          resolveAittyPreviewAssets(domPreviewPath, aittyAssets, result.artifactsDir),
        ),
        "utf8",
      );
      writtenDomPreviewPaths.add(domPreviewPath);
    }
  }

  for (const { artifact, content, viewerPath } of readableArtifacts) {
    const viewport = viewportsByName.get(artifact.viewport);
    const domPreviewPath = artifact.kind === "dom" ? artifactDomPreviewPath(artifact) : null;

    mkdirSync(dirname(viewerPath), { recursive: true });
    writeFileSync(
      viewerPath,
      renderArtifactViewerHtml({
        artifact,
        artifactsDir: result.artifactsDir,
        content,
        reportPath: result.reportPath,
        viewerPath,
        domPreview: resolveReportDomPreview(
          domPreviewPath && writtenDomPreviewPaths.has(domPreviewPath) ? domPreviewPath : null,
        ),
        viewOptions,
        viewport,
        terminalDomPreview:
          artifact.kind === "terminal"
            ? resolveReportDomPreview(
                resolveWrittenDomPreviewPath(
                  domPreviewPathsBySnapshot,
                  writtenDomPreviewPaths,
                  artifact,
                ),
              )
            : null,
      }),
      "utf8",
    );
  }
}

function resolveWrittenDomPreviewPath(
  domPreviewPathsBySnapshot: ReadonlyMap<string, string>,
  writtenDomPreviewPaths: ReadonlySet<string>,
  artifact: AgentRunArtifact,
): string | null {
  const path = domPreviewPathsBySnapshot.get(artifactSnapshotKey(artifact));
  return path && writtenDomPreviewPaths.has(path) ? path : null;
}

function readArtifactText(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}
