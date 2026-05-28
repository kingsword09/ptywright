import type { ScriptSession } from "./frame_session_types";
import type { ScriptStep } from "./schema";

export function runMouseStep(
  session: ScriptSession,
  step: Extract<ScriptStep, { type: "sendMouse" }>,
): void {
  const modifiers =
    step.shift || step.alt || step.ctrl
      ? { shift: step.shift, alt: step.alt, ctrl: step.ctrl }
      : undefined;

  session.sendMouse({
    action: step.action,
    x: step.x,
    y: step.y,
    button: step.button,
    modifiers,
  });
}
