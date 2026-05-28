import type { AgentRunArtifact } from "./runner";

export function artifactViewerPath(artifact: AgentRunArtifact): string | null {
  if (artifact.kind === "terminal") {
    return artifact.path.endsWith(".terminal.txt")
      ? artifact.path.replace(/\.terminal\.txt$/, ".terminal.viewer.html")
      : `${artifact.path}.viewer.html`;
  }

  if (artifact.kind === "dom") {
    return artifact.path.endsWith(".dom.html")
      ? artifact.path.replace(/\.dom\.html$/, ".dom.viewer.html")
      : `${artifact.path}.viewer.html`;
  }

  return null;
}

export function artifactDomPreviewPath(artifact: AgentRunArtifact): string {
  return artifact.path.endsWith(".dom.html")
    ? artifact.path.replace(/\.dom\.html$/, ".dom.preview.html")
    : `${artifact.path}.preview.html`;
}

export function artifactSnapshotKey(artifact: Pick<AgentRunArtifact, "name" | "viewport">): string {
  return `${artifact.viewport}\u0000${artifact.name}`;
}
