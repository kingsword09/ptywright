import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { Page } from "playwright";

import {
  normalizeDomSnapshot,
  normalizeTerminalText,
  sanitizeArtifactName,
  shortHash,
} from "./normalize";
import type { AgentRunArtifact } from "./runner_types";
import type { AgentFlowSpec, AgentFlowStep, AgentTextMaskRule, AgentViewport } from "./schema";
import { renderSnapshotDiff } from "./snapshot_diff";
import { readTerminalDom, readTerminalText } from "./terminal_dom";

export type SnapshotArtifactContext = {
  spec: AgentFlowSpec;
  viewport: AgentViewport;
  page: Page;
  artifactsDir: string;
  snapshotDir: string;
  updateSnapshots: boolean;
  masks: readonly AgentTextMaskRule[];
  artifacts: AgentRunArtifact[];
};

export async function captureSnapshotStep(
  ctx: SnapshotArtifactContext,
  step: Extract<AgentFlowStep, { type: "snapshot" }>,
): Promise<void> {
  const targets = step.targets ?? [
    "terminal",
    "dom",
    ...(ctx.spec.defaults?.screenshot ? ["screenshot" as const] : []),
  ];
  const base = `${sanitizeArtifactName(ctx.viewport.name)}.${sanitizeArtifactName(step.name)}`;

  for (const target of targets) {
    if (target === "terminal") {
      const text = normalizeTerminalText(await readTerminalText(ctx.page), ctx.masks);
      await writeComparableArtifact(ctx, {
        name: step.name,
        kind: "terminal",
        relativePath: `${base}.terminal.txt`,
        baselineRelativePath: `${base}.terminal.snap.txt`,
        diffRelativePath: `${base}.terminal.diff.txt`,
        content: text + "\n",
        compare: step.compare ?? true,
      });
      continue;
    }

    if (target === "dom") {
      const dom = normalizeDomSnapshot(await readTerminalDom(ctx.page), ctx.masks);
      await writeComparableArtifact(ctx, {
        name: step.name,
        kind: "dom",
        relativePath: `${base}.dom.html`,
        baselineRelativePath: `${base}.dom.snap.html`,
        diffRelativePath: `${base}.dom.diff.txt`,
        content: dom + "\n",
        compare: step.compare ?? true,
      });
      continue;
    }

    const screenshotPath = join(ctx.artifactsDir, `${base}.png`);
    await ctx.page.screenshot({ path: screenshotPath, fullPage: step.fullPage ?? false });
    ctx.artifacts.push({
      name: step.name,
      viewport: ctx.viewport.name,
      kind: "screenshot",
      path: screenshotPath,
      ok: true,
    });
  }
}

async function writeComparableArtifact(
  ctx: SnapshotArtifactContext,
  artifact: {
    name: string;
    kind: "terminal" | "dom";
    relativePath: string;
    baselineRelativePath: string;
    diffRelativePath: string;
    content: string;
    compare: boolean;
  },
): Promise<void> {
  const artifactPath = join(ctx.artifactsDir, artifact.relativePath);
  const baselinePath = join(ctx.snapshotDir, artifact.baselineRelativePath);
  const diffPath = join(ctx.artifactsDir, artifact.diffRelativePath);
  const hash = shortHash(artifact.content);

  writeFileSync(artifactPath, artifact.content, "utf8");

  if (!artifact.compare) {
    ctx.artifacts.push({
      name: artifact.name,
      viewport: ctx.viewport.name,
      kind: artifact.kind,
      path: artifactPath,
      baselinePath,
      hash,
      ok: true,
    });
    return;
  }

  if (ctx.updateSnapshots) {
    mkdirSync(dirname(baselinePath), { recursive: true });
    writeFileSync(baselinePath, artifact.content, "utf8");
    ctx.artifacts.push({
      name: artifact.name,
      viewport: ctx.viewport.name,
      kind: artifact.kind,
      path: artifactPath,
      baselinePath,
      hash,
      ok: true,
    });
    return;
  }

  let baseline: string | null = null;
  try {
    baseline = readFileSync(baselinePath, "utf8");
  } catch {
    const message = `missing snapshot ${baselinePath}; rerun with --update-snapshots`;
    ctx.artifacts.push({
      name: artifact.name,
      viewport: ctx.viewport.name,
      kind: artifact.kind,
      path: artifactPath,
      baselinePath,
      hash,
      ok: false,
      error: message,
    });
    throw new Error(message);
  }

  if (baseline !== artifact.content) {
    const message = `snapshot mismatch ${baselinePath}; rerun with --update-snapshots if intentional`;
    writeFileSync(diffPath, renderSnapshotDiff(baseline, artifact.content), "utf8");
    ctx.artifacts.push({
      name: artifact.name,
      viewport: ctx.viewport.name,
      kind: artifact.kind,
      path: artifactPath,
      baselinePath,
      diffPath,
      hash,
      ok: false,
      error: message,
    });
    throw new Error(message);
  }

  ctx.artifacts.push({
    name: artifact.name,
    viewport: ctx.viewport.name,
    kind: artifact.kind,
    path: artifactPath,
    baselinePath,
    hash,
    ok: true,
  });
}
