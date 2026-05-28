import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import type { TextMaskRule } from "../terminal/mask";
import { formatSnapshotView } from "../terminal/view";
import type { ScriptSession } from "./frame_session_types";
import type { ScriptStep } from "./schema";
import type { SnapshotRecord } from "./runner_types";

export function persistSnapshotRecord(args: {
  record: SnapshotRecord;
  saveAs?: string;
  saveTo?: string;
  snapshots: Map<string, SnapshotRecord>;
  resolveArtifactPath: (path: string) => string;
}): void {
  const saveAs = args.saveAs?.trim();
  if (saveAs) {
    args.snapshots.set(saveAs, args.record);
  }

  const saveTo = args.saveTo?.trim();
  if (!saveTo) return;

  const path = args.resolveArtifactPath(saveTo);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${args.record.text}\n`, "utf8");
}

export function selectSnapshot(
  last: SnapshotRecord | null,
  snapshots: Map<string, SnapshotRecord>,
  from?: string,
): SnapshotRecord {
  const key = from?.trim() ? from.trim() : "last";
  if (key === "last") {
    if (!last) throw new Error("expect: no previous snapshot (from=last)");
    return last;
  }

  const found = snapshots.get(key);
  if (!found) {
    throw new Error(`expect: unknown snapshot reference: ${key}`);
  }
  return found;
}

export function assertRecordMatches(
  record: SnapshotRecord,
  step: Extract<ScriptStep, { type: "expect" }>,
  stepIndex: number,
): void {
  if (step.equals !== undefined && record.text !== step.equals) {
    throw new Error(`step ${stepIndex + 1} expect.equals failed`);
  }

  if (step.contains && step.contains.length > 0) {
    for (const item of step.contains) {
      if (!record.text.includes(item)) {
        throw new Error(`step ${stepIndex + 1} expect.contains failed: ${JSON.stringify(item)}`);
      }
    }
  }

  if (step.notContains && step.notContains.length > 0) {
    for (const item of step.notContains) {
      if (record.text.includes(item)) {
        throw new Error(`step ${stepIndex + 1} expect.notContains failed: ${JSON.stringify(item)}`);
      }
    }
  }

  if (step.regex) {
    const regex = new RegExp(step.regex);
    if (!regex.test(record.text)) {
      throw new Error(`step ${stepIndex + 1} expect.regex failed: ${JSON.stringify(step.regex)}`);
    }
  }
}

export function assertGoldenText(path: string, text: string, update: boolean): void {
  if (update) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text, "utf8");
    return;
  }

  const expected = readFileSync(path, "utf8");
  if (text !== expected) {
    throw new Error(`golden mismatch: ${path}`);
  }
}

export async function snapshotAfterStep(session: ScriptSession): Promise<SnapshotRecord | null> {
  try {
    const captured = await session.snapshotText({
      scope: "visible",
      trimRight: true,
      trimBottom: true,
      captureFrame: true,
    });
    const lines = captured.text.split("\n");
    const view = formatSnapshotView({
      sessionId: session.id,
      scope: "visible",
      hash: captured.hash,
      lines,
      meta: session.getMeta(),
      lineNumbers: true,
    });
    return { kind: "view", hash: captured.hash, text: view };
  } catch {
    return null;
  }
}

export async function snapshotStep(
  session: ScriptSession,
  step: Extract<ScriptStep, { type: "snapshot" }>,
): Promise<SnapshotRecord> {
  if (step.kind === "grid") {
    if (step.mask && step.mask.length > 0) {
      throw new Error("snapshot.kind=grid does not support mask (use text/view instead)");
    }
    const { grid, hash } = await session.snapshotGrid({
      trimRight: step.trimRight,
      includeStyles: step.includeStyles,
      captureFrame: true,
    });
    return { kind: step.kind, hash, text: JSON.stringify(grid, null, 2) };
  }

  if (step.kind === "ansi" || step.kind === "view_ansi") {
    const { ansi, hash } = await session.snapshotAnsi({
      scope: step.scope,
      trimRight: step.trimRight,
      trimBottom: step.trimBottom ?? true,
      maxLines: step.maxLines,
      tailLines: step.tailLines,
      mask: step.mask as TextMaskRule[] | undefined,
    });

    if (step.kind === "ansi") {
      return { kind: step.kind, hash, text: ansi };
    }

    const lines = ansi.split("\n");
    const view = formatSnapshotView({
      sessionId: session.id,
      scope: step.scope ?? "visible",
      hash,
      lines,
      meta: session.getMeta(),
      lineNumbers: step.lineNumbers,
    });
    return { kind: step.kind, hash, text: view };
  }

  const { text, hash } = await session.snapshotText({
    scope: step.scope,
    trimRight: step.trimRight,
    trimBottom: step.trimBottom ?? true,
    maxLines: step.maxLines,
    tailLines: step.tailLines,
    captureFrame: true,
    mask: step.mask as TextMaskRule[] | undefined,
  });

  if (step.kind === "text") {
    return { kind: step.kind, hash, text };
  }

  const lines = text.split("\n");
  const view = formatSnapshotView({
    sessionId: session.id,
    scope: step.scope ?? "visible",
    hash,
    lines,
    meta: session.getMeta(),
    lineNumbers: step.lineNumbers,
  });
  return { kind: step.kind, hash, text: view };
}
