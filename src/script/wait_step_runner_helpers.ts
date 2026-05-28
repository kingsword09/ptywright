import { sleep } from "../util/sleep";
import type { ScriptSession } from "./frame_session_types";
import type { ScriptStep } from "./schema";

export async function waitForTextStep(
  session: ScriptSession,
  step: Extract<ScriptStep, { type: "waitForText" }>,
  stepIndex: number,
): Promise<void> {
  const regex = step.regex ? new RegExp(step.regex) : undefined;
  const result = await session.waitForText({
    scope: step.scope,
    text: step.text,
    regex,
    timeoutMs: step.timeoutMs ?? 10_000,
    intervalMs: step.intervalMs ?? 100,
  });
  if (!result.found) {
    throw new Error(
      `step ${stepIndex + 1} waitForText not found: ${step.text ?? step.regex ?? ""}`,
    );
  }
}

export async function waitForStableScreenStep(
  session: ScriptSession,
  step: Extract<ScriptStep, { type: "waitForStableScreen" }>,
  stepIndex: number,
): Promise<void> {
  const result = await session.waitForStableScreen({
    timeoutMs: step.timeoutMs ?? 10_000,
    quietMs: step.quietMs ?? 400,
    intervalMs: step.intervalMs ?? 80,
  });
  if (!result.stable) {
    throw new Error(`step ${stepIndex + 1} waitForStableScreen timed out`);
  }
}

export async function waitForExitStep(
  session: ScriptSession,
  step: Extract<ScriptStep, { type: "waitForExit" }>,
): Promise<void> {
  const startedAt = Date.now();
  const timeoutMs = step.timeoutMs ?? 10_000;
  const intervalMs = step.intervalMs ?? 50;

  while (Date.now() - startedAt <= timeoutMs) {
    if (session.isClosed()) break;
    await sleep(intervalMs);
  }

  const reason = session.getCloseReason();
  if (!reason) {
    throw new Error("waitForExit timed out");
  }
  if (reason.type !== "process_exit") {
    throw new Error("waitForExit: session was closed by user");
  }
  if (step.exitCode !== undefined && reason.exitCode !== step.exitCode) {
    throw new Error(`waitForExit: exitCode mismatch (got ${reason.exitCode})`);
  }
  if (step.signal !== undefined && reason.signal !== step.signal) {
    throw new Error(`waitForExit: signal mismatch (got ${String(reason.signal ?? "")})`);
  }
}
