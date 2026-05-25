import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

import type { Browser, Page } from "playwright";

import { launchAgentBrowser } from "./browser";
import { resolveAgentLaunchTarget } from "./launch";
import { normalizeAgentFlowSpec, type AgentFlowSpec, type AgentFlowStep } from "./schema";
import { loadAgentSpec } from "./spec_loader";

export type AgentRecordOptions = {
  outPath: string;
  durationMs?: number;
  headless?: boolean;
  rootDir?: string;
  includeSnapshot?: boolean;
};

export type AgentRecordResult = {
  ok: boolean;
  outPath: string;
  stepCount: number;
  url?: string;
  error?: string;
};

export async function recordAgentSpecPath(
  specPath: string,
  options: AgentRecordOptions,
): Promise<AgentRecordResult> {
  const loaded = await loadAgentSpec(specPath);
  return recordAgentSpec(loaded.spec, options);
}

export async function recordAgentSpec(
  input: unknown,
  options: AgentRecordOptions,
): Promise<AgentRecordResult> {
  const spec = normalizeAgentFlowSpec(input);
  const rootDir = options.rootDir ? resolve(process.cwd(), options.rootDir) : process.cwd();
  const outPath = isAbsolute(options.outPath)
    ? options.outPath
    : resolve(process.cwd(), options.outPath);
  const durationMs = options.durationMs ?? 30_000;
  const steps: AgentFlowStep[] = [];

  let browser: Browser | null = null;
  const launchTarget = await resolveAgentLaunchTarget(spec.launch, { rootDir });

  try {
    browser = await launchAgentBrowser({ headless: options.headless ?? false });
    const viewport = spec.viewports?.[0] ?? { name: "desktop", width: 1280, height: 820 };
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: viewport.deviceScaleFactor,
      isMobile: viewport.isMobile,
      hasTouch: viewport.hasTouch,
    });
    const page = await context.newPage();
    await installRecorderHooks(page);
    await page.goto(launchTarget.url, {
      waitUntil: "domcontentloaded",
      timeout: spec.defaults?.timeoutMs ?? 30_000,
    });
    await page
      .locator("[data-terminal-root]")
      .first()
      .waitFor({
        state: "attached",
        timeout: spec.defaults?.timeoutMs ?? 30_000,
      });

    await page.waitForTimeout(durationMs);
    steps.push(...(await readRecordedSteps(page)));
    await context.close();

    if (options.includeSnapshot ?? true) {
      steps.push({
        type: "waitForStableDom",
        quietMs: 600,
        intervalMs: 150,
        timeoutMs: spec.defaults?.timeoutMs ?? 30_000,
      });
      steps.push({
        type: "snapshot",
        name: "recorded-final",
        targets: ["terminal", "dom", "screenshot"],
      });
    }

    const recorded: AgentFlowSpec = {
      ...spec,
      steps: steps.length > 0 ? steps : spec.steps,
    };
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(recorded, null, 2) + "\n", "utf8");

    return { ok: true, outPath, stepCount: recorded.steps.length, url: launchTarget.url };
  } catch (error) {
    return {
      ok: false,
      outPath,
      stepCount: steps.length,
      url: launchTarget.url,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await browser?.close();
    await launchTarget.session?.close();
  }
}

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

async function readRecordedSteps(page: Page): Promise<AgentFlowStep[]> {
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
