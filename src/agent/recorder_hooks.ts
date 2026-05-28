import type { Page } from "playwright";

import type { AgentFlowStep } from "./schema";

export async function installRecorderHooks(page: Page): Promise<void> {
  await page.addInitScript(() => {
    type RecordedStep =
      | { type: "typeText"; text: string; enter?: boolean }
      | { type: "pressKey"; key: string }
      | { type: "click"; x: number; y: number };

    const state = {
      steps: [] as RecordedStep[],
      textBuffer: "",
    };

    const flushText = () => {
      if (!state.textBuffer) return;
      state.steps.push({ type: "typeText", text: state.textBuffer });
      state.textBuffer = "";
    };

    window.addEventListener(
      "keydown",
      (event) => {
        if (event.metaKey || event.ctrlKey || event.altKey) {
          flushText();
          state.steps.push({ type: "pressKey", key: formatKey(event) });
          return;
        }

        if (event.key === "Enter") {
          if (state.textBuffer) {
            state.steps.push({ type: "typeText", text: state.textBuffer, enter: true });
            state.textBuffer = "";
          } else {
            state.steps.push({ type: "pressKey", key: "Enter" });
          }
          return;
        }

        if (event.key.length === 1) {
          state.textBuffer += event.key;
          return;
        }

        flushText();
        state.steps.push({ type: "pressKey", key: formatKey(event) });
      },
      true,
    );

    window.addEventListener(
      "click",
      (event) => {
        flushText();
        state.steps.push({
          type: "click",
          x: Math.max(0, Math.round(event.clientX)),
          y: Math.max(0, Math.round(event.clientY)),
        });
      },
      true,
    );

    Object.defineProperty(window, "__ptywrightAgentRecorder", {
      value: {
        read() {
          flushText();
          return state.steps.slice();
        },
      },
      configurable: true,
    });

    function formatKey(event: KeyboardEvent): string {
      const parts: string[] = [];
      if (event.ctrlKey) parts.push("Control");
      if (event.altKey) parts.push("Alt");
      if (event.metaKey) parts.push("Meta");
      if (event.shiftKey && event.key.length !== 1) parts.push("Shift");
      parts.push(event.key === " " ? "Space" : event.key);
      return parts.join("+");
    }
  });
}

export async function readRecordedSteps(page: Page): Promise<AgentFlowStep[]> {
  return page.evaluate(() => {
    const recorder = (
      window as Window &
        typeof globalThis & {
          __ptywrightAgentRecorder?: { read(): unknown[] };
        }
    ).__ptywrightAgentRecorder;

    return (recorder?.read() ?? []) as AgentFlowStep[];
  });
}
