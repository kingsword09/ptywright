import type { TerminalSession } from "../session/terminal_session";
import type { RoutineStep } from "./routine_types";

export async function runRoutineStep(session: TerminalSession, step: RoutineStep): Promise<void> {
  if (step.action === "sendText" && step.text !== undefined) {
    session.sendText(step.text, { enter: step.enter });
    return;
  }

  if (step.action === "pressKey" && step.key) {
    session.pressKey(step.key);
    return;
  }

  if (step.action === "wait") {
    if (step.waitFor || step.regex) {
      const regex = step.regex ? new RegExp(step.regex) : undefined;
      const waitResult = await session.waitForText({
        text: step.waitFor,
        regex,
        timeoutMs: step.timeoutMs ?? 10_000,
        intervalMs: 100,
      });
      if (!waitResult.found) {
        throw new Error(`wait failed: ${step.waitFor || step.regex}`);
      }
      return;
    }

    await session.waitForStableScreen({
      timeoutMs: step.timeoutMs ?? 5_000,
      quietMs: 300,
      intervalMs: 80,
    });
    return;
  }

  if (step.action === "assert") {
    const regex = step.regex ? new RegExp(step.regex) : undefined;
    const assertResult = await session.waitForText({
      text: step.waitFor,
      regex,
      timeoutMs: 0,
      intervalMs: 0,
    });
    if (!assertResult.found) {
      throw new Error(`assert failed: ${step.description || step.waitFor || step.regex}`);
    }
  }
}

export async function captureRoutineSnapshot(
  session: TerminalSession,
): Promise<{ text: string; hash: string }> {
  return await session.snapshotText({
    scope: "visible",
    trimRight: true,
    trimBottom: true,
    captureFrame: true,
  });
}

export async function tryCaptureRoutineSnapshot(
  session: TerminalSession,
): Promise<{ text: string; hash: string } | null> {
  try {
    return await captureRoutineSnapshot(session);
  } catch {
    return null;
  }
}
