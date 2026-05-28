import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

import type { Browser } from "playwright";

import type { ResolvedPtywrightConfig } from "../config";
import { launchAgentBrowser } from "./browser";
import { normalizeAgentFlowSpecWithConfig } from "./config_defaults";
import { resolveAgentLaunchTarget } from "./launch";
import { installRecorderHooks, readRecordedSteps } from "./recorder_hooks";
import { type AgentFlowSpec, type AgentFlowStep } from "./schema";
import { loadAgentSpec } from "./spec_loader";

export { installRecorderHooks } from "./recorder_hooks";

export type AgentRecordOptions = {
  outPath: string;
  durationMs?: number;
  headless?: boolean;
  rootDir?: string;
  config?: ResolvedPtywrightConfig;
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
  return recordAgentSpec(loaded.raw, options);
}

export async function recordAgentSpec(
  input: unknown,
  options: AgentRecordOptions,
): Promise<AgentRecordResult> {
  const spec = normalizeAgentFlowSpecWithConfig(input, options.config);
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
