import type { ScriptSession } from "./frame_session_types";
import type { ScriptStep } from "./schema";

export async function expectSessionMeta(
  session: ScriptSession,
  step: Extract<ScriptStep, { type: "expectMeta" }>,
): Promise<void> {
  await session.flush();
  const meta = session.getMeta();

  if (step.bufferType !== undefined && meta.bufferType !== step.bufferType) {
    throw new Error(`expectMeta.bufferType mismatch (got ${meta.bufferType})`);
  }
  if (step.cols !== undefined && meta.cols !== step.cols) {
    throw new Error(`expectMeta.cols mismatch (got ${meta.cols})`);
  }
  if (step.rows !== undefined && meta.rows !== step.rows) {
    throw new Error(`expectMeta.rows mismatch (got ${meta.rows})`);
  }

  if (step.cursor) {
    const cursorAbsY = meta.baseY + meta.cursorY;
    const cursorViewportRow = cursorAbsY - meta.viewportY;
    const cursorViewportCol = meta.cursorX;
    const actual = { x: cursorViewportCol + 1, y: cursorViewportRow + 1 };
    if (actual.x !== step.cursor.x || actual.y !== step.cursor.y) {
      throw new Error(`expectMeta.cursor mismatch (got ${actual.x},${actual.y})`);
    }
  }
}

export async function runAssertStep(
  session: ScriptSession,
  step: Extract<ScriptStep, { type: "assert" }>,
  stepIndex: number,
): Promise<void> {
  const regex = step.regex ? new RegExp(step.regex) : undefined;
  const result = await session.waitForText({
    scope: step.scope,
    text: step.text,
    regex,
    timeoutMs: 0,
    intervalMs: 0,
  });

  if (!result.found) {
    throw new Error(
      `step ${stepIndex + 1} assert failed: ${step.description || step.text || step.regex || "pattern mismatch"}`,
    );
  }
}
