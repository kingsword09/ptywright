import { normalizeReplayDom, normalizeTerminalText } from "./normalize";
import { upsertAgentCassetteFrame, type MutableAgentCassette } from "./cassette";
import type { AgentFlowStep } from "./schema";
import { captureSnapshotStep, type SnapshotArtifactContext } from "./snapshot_artifacts";
import {
  readTerminalDom,
  readTerminalText,
  waitForStableDom,
  waitForTerminalText,
} from "./terminal_dom";

export type AgentRunContext = SnapshotArtifactContext & {
  recordCassette: boolean;
  replay: boolean;
  cassette?: MutableAgentCassette;
  nextReplayPhase: number;
};

export async function runAgentStep(ctx: AgentRunContext, step: AgentFlowStep): Promise<void> {
  const timeout = ctx.spec.defaults?.timeoutMs ?? 30_000;

  if (step.type === "waitForText") {
    await waitForTerminalText(ctx.page, {
      text: step.text,
      regex: step.regex,
      timeoutMs: step.timeoutMs ?? timeout,
    });
    return;
  }

  if (step.type === "typeText") {
    await advanceReplayPhase(ctx);
    if (!ctx.replay) {
      const root = ctx.page.locator("[data-terminal-root]").first();
      await root.click({ timeout });
      await ctx.page.keyboard.type(step.text, { delay: step.delayMs });
      if (step.enter) {
        await ctx.page.keyboard.press("Enter");
      }
    }
    return;
  }

  if (step.type === "pressKey") {
    await advanceReplayPhase(ctx);
    if (!ctx.replay) {
      await ctx.page.keyboard.press(step.key);
    }
    return;
  }

  if (step.type === "click") {
    await advanceReplayPhase(ctx);
    if (ctx.replay) {
      return;
    }
    if (step.selector) {
      await ctx.page.locator(step.selector).first().click({ timeout });
      return;
    }
    if (step.text) {
      await ctx.page.getByText(step.text, { exact: false }).first().click({ timeout });
      return;
    }
    await ctx.page.mouse.click(step.x!, step.y!);
    return;
  }

  if (step.type === "waitForStableDom") {
    await waitForStableDom(ctx.page, {
      timeoutMs: step.timeoutMs ?? timeout,
      quietMs: step.quietMs ?? 350,
      intervalMs: step.intervalMs ?? 100,
    });
    return;
  }

  if (step.type === "snapshot") {
    await captureSnapshotStep(ctx, step);
    return;
  }

  if (step.type === "sleep") {
    if (!ctx.replay) {
      await new Promise((resolveSleep) => setTimeout(resolveSleep, step.ms));
    }
    return;
  }

  if (step.type === "mark") {
    return;
  }
}

export async function captureCassetteFrame(
  ctx: AgentRunContext,
  frame: {
    stepIndex: number | null;
    stepType: string;
  },
): Promise<void> {
  if (!ctx.cassette || !ctx.recordCassette) {
    return;
  }

  const phase = ctx.nextReplayPhase;
  upsertAgentCassetteFrame(ctx.cassette, {
    viewport: ctx.viewport,
    phase,
    stepIndex: frame.stepIndex,
    stepType: frame.stepType,
    terminalText: normalizeTerminalText(await readTerminalText(ctx.page), ctx.masks),
    dom: normalizeReplayDom(await readTerminalDom(ctx.page), ctx.masks),
    capturedAt: new Date().toISOString(),
  });
}

async function advanceReplayPhase(ctx: AgentRunContext): Promise<void> {
  if (!ctx.replay) {
    ctx.nextReplayPhase += 1;
    return;
  }

  ctx.nextReplayPhase += 1;
  await ctx.page.evaluate((phase) => {
    const replay = window as Window &
      typeof globalThis & {
        __ptywrightReplaySetPhase?: (nextPhase: number) => void;
      };
    replay.__ptywrightReplaySetPhase?.(phase);
  }, ctx.nextReplayPhase);
}
