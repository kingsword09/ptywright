import type { Browser } from "playwright";

import type { MutableAgentCassette } from "./cassette";
import { resolveAgentLaunchTarget } from "./launch";
import { resolveAgentMasks } from "./presets";
import type { AgentRunResult } from "./runner_types";
import type { AgentFlowSpec, AgentViewport } from "./schema";
import { formatAgentStepLabel } from "./step_label";
import { captureCassetteFrame, runAgentStep, type AgentRunContext } from "./step_runner";
import { waitForTerminalRoot } from "./terminal_dom";
import { withTimeout } from "./timeout";

export async function runAgentViewport(args: {
  browser: Browser;
  spec: AgentFlowSpec;
  viewport: AgentViewport;
  rootDir: string;
  artifactsDir: string;
  snapshotDir: string;
  updateSnapshots: boolean;
  recordCassette: boolean;
  cassette?: MutableAgentCassette;
  result: AgentRunResult;
}): Promise<void> {
  const {
    browser,
    spec,
    viewport,
    rootDir,
    artifactsDir,
    snapshotDir,
    updateSnapshots,
    recordCassette,
    cassette,
    result,
  } = args;
  const launchTarget = await resolveAgentLaunchTarget(spec.launch, { rootDir });
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.deviceScaleFactor,
    isMobile: viewport.isMobile,
    hasTouch: viewport.hasTouch,
  });
  const page = await context.newPage();
  const ctx: AgentRunContext = {
    spec,
    viewport,
    page,
    artifactsDir,
    snapshotDir,
    updateSnapshots,
    recordCassette,
    masks: resolveAgentMasks(spec),
    artifacts: result.artifacts,
    replay: Boolean(args.cassette && !args.recordCassette),
    cassette,
    nextReplayPhase: 0,
  };

  try {
    await page.goto(resolveViewportUrl(launchTarget.url, viewport), {
      waitUntil: "domcontentloaded",
      timeout: spec.defaults?.timeoutMs ?? 30_000,
    });
    await waitForTerminalRoot(page, spec.defaults?.timeoutMs ?? 30_000);
    await captureCassetteFrame(ctx, {
      stepIndex: null,
      stepType: "initial",
    });

    for (let i = 0; i < spec.steps.length; i += 1) {
      const step = spec.steps[i]!;
      const started = Date.now();
      try {
        await runAgentStep(ctx, step);
        result.steps.push({
          index: i,
          type: step.type,
          label: formatAgentStepLabel(step),
          durationMs: Date.now() - started,
          ok: true,
        });
        await captureCassetteFrame(ctx, {
          stepIndex: i,
          stepType: step.type,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        result.ok = false;
        result.errors.push(`${viewport.name} step ${i + 1} ${step.type}: ${message}`);
        result.steps.push({
          index: i,
          type: step.type,
          label: formatAgentStepLabel(step),
          durationMs: Date.now() - started,
          ok: false,
          error: message,
        });
        break;
      }
    }
  } finally {
    await withTimeout(
      context.close().catch(() => undefined),
      5_000,
    );
    await launchTarget.session?.close();
  }
}

function resolveViewportUrl(url: string, viewport: AgentViewport): string {
  return url
    .replaceAll("{viewportName}", encodeURIComponent(viewport.name))
    .replaceAll("{viewportWidth}", encodeURIComponent(String(viewport.width)))
    .replaceAll("{viewportHeight}", encodeURIComponent(String(viewport.height)));
}
