import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { formatSnapshotView } from "../terminal/view";
import type { ScriptSession } from "./frame_session_types";
import type { SnapshotRecord } from "./runner_types";
import type { ScriptStep } from "./schema";

export async function writeFailureArtifacts(args: {
  session: ScriptSession;
  artifactsDir: string;
  scriptName: string;
  stepIndex: number;
  step: ScriptStep | null;
  last: SnapshotRecord | null;
  error: unknown;
}): Promise<void> {
  const { session, artifactsDir, scriptName, stepIndex, step, last, error } = args;

  const err = error instanceof Error ? error : new Error(String(error));
  const errorText = err.stack ?? err.message;
  writeFileSync(join(artifactsDir, "failure.error.txt"), `${errorText}\n`, "utf8");

  const stepPayload = {
    script: scriptName,
    stepIndex: stepIndex >= 0 ? stepIndex + 1 : null,
    step: step ?? null,
    last: last ? { kind: last.kind, hash: last.hash } : null,
  };
  writeFileSync(
    join(artifactsDir, "failure.step.json"),
    `${JSON.stringify(stepPayload, null, 2)}\n`,
    "utf8",
  );

  let capturedText: string | undefined = undefined;
  let capturedHash: string | undefined = undefined;
  try {
    const captured = await session.snapshotText({
      scope: "visible",
      trimRight: true,
      trimBottom: true,
      captureFrame: true,
    });
    capturedText = captured.text;
    capturedHash = captured.hash;
  } catch {
    // ignore best-effort snapshot on failure
  }

  const text = capturedText ?? last?.text;
  const hash = capturedHash ?? last?.hash ?? "unknown";

  if (text !== undefined) {
    writeFileSync(join(artifactsDir, "failure.last.txt"), `${text}\n`, "utf8");

    const view = formatSnapshotView({
      sessionId: session.id,
      scope: "visible",
      hash,
      lines: text.split("\n"),
      meta: session.getMeta(),
      lineNumbers: true,
    });
    writeFileSync(join(artifactsDir, "failure.last.view.txt"), `${view}\n`, "utf8");
  }
}
