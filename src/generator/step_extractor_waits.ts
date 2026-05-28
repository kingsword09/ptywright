import type { ExtractedStep } from "./step_extractor_types";

export function insertDefaultWaits(steps: ExtractedStep[]): ExtractedStep[] {
  const result: ExtractedStep[] = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (!step) continue;

    result.push(step);

    const nextStep = steps[i + 1];
    const isInputStep = step.type === "sendText" || step.type === "pressKey";
    const nextIsWait =
      nextStep?.type === "waitForText" ||
      nextStep?.type === "waitForStableScreen" ||
      nextStep?.type === "sleep";

    if (isInputStep && !nextIsWait && i < steps.length - 1) {
      result.push({
        type: "waitForStableScreen",
        params: { timeoutMs: 5000, quietMs: 300 },
        source: "inferred",
        confidence: "low",
      });
    }
  }

  return result;
}
