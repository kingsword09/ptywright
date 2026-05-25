import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";

import type { Browser, Page } from "playwright";

import { buildAittyExecCommand, launchAittyBrowserSession } from "./aitty";
import { launchAgentBrowser } from "./browser";
import {
  createAgentCassette,
  isAgentCassetteLike,
  normalizeAgentCassette,
  readAgentCassettePath,
  startAgentCassetteServer,
  upsertAgentCassetteFrame,
  type AgentCassette,
  type MutableAgentCassette,
} from "./cassette";
import {
  normalizeDomSnapshot,
  normalizeTerminalText,
  sanitizeArtifactName,
  shortHash,
} from "./normalize";
import { agentManifestPath, writeAgentManifestPath } from "./manifest";
import { resolveAgentFlavor, resolveAgentMasks } from "./presets";
import { writeAgentReport } from "./report";
import {
  AGENT_RUN_RECORD_SCHEMA_URL,
  formatAgentArgv,
  readAgentRunRecordPath,
  writeAgentRunRecordPath,
  type AgentCommandRecord,
  type AgentRunRecord,
  type AgentRunArtifactRecord,
  type AgentRunRecordMode,
  type AgentRecordedStepRecord,
} from "./run_record";
import {
  normalizeAgentFlowSpec,
  type AgentFlowSpec,
  type AgentFlowStep,
  type AgentTextMaskRule,
  type AgentViewport,
} from "./schema";
import { loadAgentSpec } from "./spec_loader";

export type AgentRunnerOptions = {
  artifactsDir?: string;
  updateSnapshots?: boolean;
  headless?: boolean;
  rootDir?: string;
  replayCassette?: AgentCassette;
  replaySourceCassettePath?: string;
};

export type AgentRunArtifact = AgentRunArtifactRecord;

export type AgentRecordedStep = AgentRecordedStepRecord;

export type AgentRunMode = AgentRunRecordMode;

export type AgentRunResult = {
  ok: boolean;
  name: string;
  mode: AgentRunMode;
  agentFlavor: string;
  startedAt: number;
  durationMs: number;
  artifactsDir: string;
  snapshotDir: string;
  reportPath: string;
  recordPath: string;
  flowPath: string;
  cassettePath: string;
  replaySourceCassettePath?: string;
  replayCommand: string;
  commands: {
    replay: AgentCommandRecord;
    updateSnapshots: AgentCommandRecord;
  };
  viewports: AgentViewport[];
  cassetteFrameCount: number;
  steps: AgentRecordedStep[];
  artifacts: AgentRunArtifact[];
  errors: string[];
};

type RunContext = {
  spec: AgentFlowSpec;
  viewport: AgentViewport;
  page: Page;
  artifactsDir: string;
  snapshotDir: string;
  updateSnapshots: boolean;
  recordCassette: boolean;
  masks: readonly AgentTextMaskRule[];
  artifacts: AgentRunArtifact[];
  replay: boolean;
  cassette?: MutableAgentCassette;
  nextReplayPhase: number;
};

export async function runAgentSpecPath(
  specPath: string,
  options: AgentRunnerOptions = {},
): Promise<AgentRunResult> {
  const loaded = await loadAgentSpec(specPath);
  return runAgentSpec(loaded.spec, options);
}

export async function replayAgentRecordPath(
  recordPath: string,
  options: AgentRunnerOptions = {},
): Promise<AgentRunResult> {
  const raw = JSON.parse(readFileSync(recordPath, "utf8")) as unknown;

  if (isAgentCassetteLike(raw)) {
    const cassette = normalizeAgentCassette(raw);
    return replayAgentCassette(cassette, recordPath, options);
  }

  const record = readAgentRunRecordPath(recordPath);

  if (record.cassettePath) {
    const cassettePath = isAbsolute(record.cassettePath)
      ? record.cassettePath
      : resolve(dirname(recordPath), record.cassettePath);
    const cassette = readAgentCassettePath(cassettePath, record.spec);
    return replayAgentCassette(cassette, cassettePath, {
      ...options,
      artifactsDir: options.artifactsDir ?? join(dirname(recordPath), "replay"),
    });
  }

  if (record.spec) {
    return runAgentSpec(record.spec, options);
  }

  if (!record.flowPath) {
    throw new Error(`invalid agent run record: missing replay source in ${recordPath}`);
  }
  const flowPath = isAbsolute(record.flowPath)
    ? record.flowPath
    : resolve(dirname(recordPath), record.flowPath);
  return runAgentSpecPath(flowPath, options);
}

export async function runAgentSpec(
  input: unknown,
  options: AgentRunnerOptions = {},
): Promise<AgentRunResult> {
  const startedAt = Date.now();
  const rootDir = options.rootDir ? resolve(process.cwd(), options.rootDir) : process.cwd();
  const spec = normalizeAgentFlowSpec(input);
  const name = sanitizeArtifactName(spec.name ?? "agent-flow");
  const artifactsDir = resolve(
    rootDir,
    options.artifactsDir ?? spec.artifactsDir ?? join(".tmp", "agent", name),
  );
  const snapshotDir = resolve(rootDir, spec.snapshotDir ?? join("snapshots", name));
  const reportPath = join(artifactsDir, "index.html");
  const recordPath = join(artifactsDir, `${name}.agent-run.json`);
  const flowPath = join(artifactsDir, `${name}.flow.json`);
  const cassettePath = join(artifactsDir, `${name}.cassette.json`);
  const updateSnapshots = options.updateSnapshots ?? envTruthy(process.env.UPDATE_SNAPSHOTS);
  const cassette = options.replayCassette ?? createAgentCassette(name, spec);

  mkdirSync(artifactsDir, { recursive: true });
  mkdirSync(snapshotDir, { recursive: true });

  const replayArgv = ["ptywright", "agent", "replay", relative(process.cwd(), recordPath)];
  const result: AgentRunResult = {
    ok: true,
    name,
    mode: options.replayCassette ? "replay" : "live",
    startedAt,
    durationMs: 0,
    artifactsDir,
    snapshotDir,
    reportPath,
    recordPath,
    flowPath,
    cassettePath,
    replaySourceCassettePath: options.replaySourceCassettePath,
    replayCommand: formatAgentArgv(replayArgv),
    commands: {
      replay: { argv: replayArgv },
      updateSnapshots: { argv: [...replayArgv, "--update-snapshots"] },
    },
    agentFlavor: resolveAgentFlavor(spec),
    viewports: spec.viewports ?? [],
    cassetteFrameCount: cassette.frames.length,
    steps: [],
    artifacts: [],
    errors: [],
  };

  writeFileSync(flowPath, JSON.stringify(spec, null, 2) + "\n", "utf8");

  let browser: Browser | null = null;
  try {
    browser = await launchAgentBrowser({ headless: options.headless ?? true });

    for (const viewport of spec.viewports ?? []) {
      await runViewport({
        browser,
        spec,
        viewport,
        rootDir,
        artifactsDir,
        snapshotDir,
        updateSnapshots,
        recordCassette: !options.replayCassette,
        cassette,
        result,
      });
    }
  } catch (error) {
    result.ok = false;
    result.errors.push(error instanceof Error ? error.message : String(error));
  } finally {
    await closeBrowserSafely(browser);
    result.durationMs = Date.now() - startedAt;
    if (options.replaySourceCassettePath) {
      writeFileSync(cassettePath, readFileSync(options.replaySourceCassettePath, "utf8"), "utf8");
    } else {
      writeFileSync(cassettePath, JSON.stringify(cassette, null, 2) + "\n", "utf8");
    }
    result.cassetteFrameCount = cassette.frames.length;
    writeRunRecord(result, spec);
    writeAgentReport(reportPath, result);
    writeRunManifest(result);
  }

  return result;
}

async function runViewport(args: {
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
  const launchMode = spec.launch.mode ?? (spec.launch.url ? "url" : "aitty");
  const session =
    launchMode === "aitty" ? await launchAittyBrowserSession(spec.launch, { rootDir }) : null;
  const url = launchMode === "url" ? spec.launch.url! : session!.url;
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.deviceScaleFactor,
    isMobile: viewport.isMobile,
    hasTouch: viewport.hasTouch,
  });
  const page = await context.newPage();
  const ctx: RunContext = {
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
    await page.goto(url, {
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
        await runStep(ctx, step);
        result.steps.push({
          index: i,
          type: step.type,
          label: formatStepLabel(step),
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
          label: formatStepLabel(step),
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
    await session?.close();
  }
}

async function replayAgentCassette(
  cassette: AgentCassette,
  cassettePath: string,
  options: AgentRunnerOptions,
): Promise<AgentRunResult> {
  const server = await startAgentCassetteServer(cassette);
  try {
    const replaySpec = structuredClone(cassette.spec);
    const replayCassette = structuredClone(cassette);
    return await runAgentSpec(
      {
        ...replaySpec,
        launch: {
          mode: "url",
          url: server.url,
          agentFlavor: replaySpec.launch.agentFlavor,
        },
      },
      {
        ...options,
        artifactsDir: options.artifactsDir ?? join(dirname(cassettePath), "replay"),
        replayCassette,
        replaySourceCassettePath: cassettePath,
      },
    );
  } finally {
    await server.close();
  }
}

async function closeBrowserSafely(browser: Browser | null): Promise<void> {
  if (!browser) return;
  await withTimeout(
    browser.close().catch(() => undefined),
    5_000,
  );
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<undefined>((resolveTimeout) => {
        timer = setTimeout(resolveTimeout, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function runStep(ctx: RunContext, step: AgentFlowStep): Promise<void> {
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

async function captureCassetteFrame(
  ctx: RunContext,
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
    dom: normalizeDomSnapshot(await readTerminalDom(ctx.page), ctx.masks),
    capturedAt: new Date().toISOString(),
  });
}

async function advanceReplayPhase(ctx: RunContext): Promise<void> {
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

async function captureSnapshotStep(
  ctx: RunContext,
  step: Extract<AgentFlowStep, { type: "snapshot" }>,
): Promise<void> {
  const targets = step.targets ?? [
    "terminal",
    "dom",
    ...(ctx.spec.defaults?.screenshot ? ["screenshot" as const] : []),
  ];
  const base = `${sanitizeArtifactName(ctx.viewport.name)}.${sanitizeArtifactName(step.name)}`;

  for (const target of targets) {
    if (target === "terminal") {
      const text = normalizeTerminalText(await readTerminalText(ctx.page), ctx.masks);
      await writeComparableArtifact(ctx, {
        name: step.name,
        kind: "terminal",
        relativePath: `${base}.terminal.txt`,
        baselineRelativePath: `${base}.terminal.snap.txt`,
        diffRelativePath: `${base}.terminal.diff.txt`,
        content: text + "\n",
        compare: step.compare ?? true,
      });
      continue;
    }

    if (target === "dom") {
      const dom = normalizeDomSnapshot(await readTerminalDom(ctx.page), ctx.masks);
      await writeComparableArtifact(ctx, {
        name: step.name,
        kind: "dom",
        relativePath: `${base}.dom.html`,
        baselineRelativePath: `${base}.dom.snap.html`,
        diffRelativePath: `${base}.dom.diff.txt`,
        content: dom + "\n",
        compare: step.compare ?? true,
      });
      continue;
    }

    const screenshotPath = join(ctx.artifactsDir, `${base}.png`);
    await ctx.page.screenshot({ path: screenshotPath, fullPage: step.fullPage ?? false });
    ctx.artifacts.push({
      name: step.name,
      viewport: ctx.viewport.name,
      kind: "screenshot",
      path: screenshotPath,
      ok: true,
    });
  }
}

async function writeComparableArtifact(
  ctx: RunContext,
  artifact: {
    name: string;
    kind: "terminal" | "dom";
    relativePath: string;
    baselineRelativePath: string;
    diffRelativePath: string;
    content: string;
    compare: boolean;
  },
): Promise<void> {
  const artifactPath = join(ctx.artifactsDir, artifact.relativePath);
  const baselinePath = join(ctx.snapshotDir, artifact.baselineRelativePath);
  const diffPath = join(ctx.artifactsDir, artifact.diffRelativePath);
  const hash = shortHash(artifact.content);

  writeFileSync(artifactPath, artifact.content, "utf8");

  if (!artifact.compare) {
    ctx.artifacts.push({
      name: artifact.name,
      viewport: ctx.viewport.name,
      kind: artifact.kind,
      path: artifactPath,
      baselinePath,
      hash,
      ok: true,
    });
    return;
  }

  if (ctx.updateSnapshots) {
    mkdirSync(dirname(baselinePath), { recursive: true });
    writeFileSync(baselinePath, artifact.content, "utf8");
    ctx.artifacts.push({
      name: artifact.name,
      viewport: ctx.viewport.name,
      kind: artifact.kind,
      path: artifactPath,
      baselinePath,
      hash,
      ok: true,
    });
    return;
  }

  let baseline: string | null = null;
  try {
    baseline = readFileSync(baselinePath, "utf8");
  } catch {
    const message = `missing snapshot ${baselinePath}; rerun with --update-snapshots`;
    ctx.artifacts.push({
      name: artifact.name,
      viewport: ctx.viewport.name,
      kind: artifact.kind,
      path: artifactPath,
      baselinePath,
      hash,
      ok: false,
      error: message,
    });
    throw new Error(message);
  }

  if (baseline !== artifact.content) {
    const message = `snapshot mismatch ${baselinePath}; rerun with --update-snapshots if intentional`;
    writeFileSync(diffPath, renderSnapshotDiff(baseline, artifact.content), "utf8");
    ctx.artifacts.push({
      name: artifact.name,
      viewport: ctx.viewport.name,
      kind: artifact.kind,
      path: artifactPath,
      baselinePath,
      diffPath,
      hash,
      ok: false,
      error: message,
    });
    throw new Error(message);
  }

  ctx.artifacts.push({
    name: artifact.name,
    viewport: ctx.viewport.name,
    kind: artifact.kind,
    path: artifactPath,
    baselinePath,
    hash,
    ok: true,
  });
}

function renderSnapshotDiff(expected: string, received: string): string {
  const expectedLines = expected.split("\n");
  const receivedLines = received.split("\n");
  const max = Math.max(expectedLines.length, receivedLines.length);
  const out = ["--- expected", "+++ received"];

  for (let i = 0; i < max; i += 1) {
    const before = expectedLines[i];
    const after = receivedLines[i];
    if (before === after) {
      if (before !== undefined) out.push(`  ${before}`);
      continue;
    }
    if (before !== undefined) out.push(`- ${before}`);
    if (after !== undefined) out.push(`+ ${after}`);
  }

  return out.join("\n") + "\n";
}

async function waitForTerminalRoot(page: Page, timeoutMs: number): Promise<void> {
  await page
    .locator("[data-terminal-root]")
    .first()
    .waitFor({ state: "attached", timeout: timeoutMs });
}

async function waitForTerminalText(
  page: Page,
  args: { text?: string; regex?: string; timeoutMs: number },
): Promise<void> {
  const started = Date.now();
  const matcher = args.regex ? new RegExp(args.regex) : null;

  while (Date.now() - started < args.timeoutMs) {
    const text = await readTerminalText(page);
    if (args.text && text.includes(args.text)) return;
    if (matcher?.test(text)) return;
    await new Promise((resolvePoll) => setTimeout(resolvePoll, 100));
  }

  throw new Error(`timed out waiting for terminal text ${args.text ?? args.regex ?? ""}`);
}

async function waitForStableDom(
  page: Page,
  args: { timeoutMs: number; quietMs: number; intervalMs: number },
): Promise<void> {
  const started = Date.now();
  let last = "";
  let stableSince = Date.now();

  while (Date.now() - started < args.timeoutMs) {
    const current = await readTerminalDomIfPresent(page);
    if (current === null) {
      await new Promise((resolvePoll) => setTimeout(resolvePoll, args.intervalMs));
      continue;
    }
    if (current !== last) {
      last = current;
      stableSince = Date.now();
    } else if (Date.now() - stableSince >= args.quietMs) {
      return;
    }
    await new Promise((resolvePoll) => setTimeout(resolvePoll, args.intervalMs));
  }

  throw new Error(`timed out waiting for stable terminal DOM`);
}

async function readTerminalText(page: Page): Promise<string> {
  const text = await page.evaluate(() => {
    const node = document.querySelector("[data-terminal-root]");
    if (!node) return null;
    const rows = Array.from(node.querySelectorAll(".term-grid .term-row"));
    if (rows.length > 0) {
      return rows.map((row) => row.textContent ?? "").join("\n");
    }
    return node.textContent ?? "";
  });
  if (text === null) {
    throw new Error("terminal root is not attached");
  }
  return text;
}

async function readTerminalDom(page: Page): Promise<string> {
  const dom = await readTerminalDomIfPresent(page);
  if (dom === null) {
    throw new Error("terminal root is not attached");
  }
  return dom;
}

async function readTerminalDomIfPresent(page: Page): Promise<string | null> {
  return page.evaluate(() => document.querySelector("[data-terminal-root]")?.innerHTML ?? null);
}

function writeRunRecord(result: AgentRunResult, spec: AgentFlowSpec): void {
  const record: AgentRunRecord = {
    $schema: AGENT_RUN_RECORD_SCHEMA_URL,
    version: 1,
    name: result.name,
    ok: result.ok,
    startedAt: new Date(result.startedAt).toISOString(),
    durationMs: result.durationMs,
    mode: result.mode,
    spec,
    flowPath: relative(dirname(result.recordPath), result.flowPath),
    artifactsDir: result.artifactsDir,
    snapshotDir: result.snapshotDir,
    reportPath: result.reportPath,
    cassettePath: relative(dirname(result.recordPath), result.cassettePath),
    cassetteFrameCount: result.cassetteFrameCount,
    replayCommand: result.replayCommand,
    commands: result.commands,
    steps: result.steps,
    artifacts: result.artifacts,
    errors: result.errors,
  };

  writeAgentRunRecordPath(result.recordPath, record);
}

function writeRunManifest(result: AgentRunResult): void {
  writeAgentManifestPath(agentManifestPath(result.artifactsDir), {
    kind: "run",
    ok: result.ok,
    rootDir: result.artifactsDir,
    primaryPath: result.recordPath,
    commands: result.commands,
    validation: {
      ok: result.ok,
      stages: [
        {
          name: "run",
          ok: result.ok,
          totalCount: result.artifacts.length,
          failureCount: result.artifacts.filter((artifact) => !artifact.ok).length,
        },
      ],
    },
    files: [
      { path: result.flowPath, kind: "flow", role: "flow" },
      { path: result.cassettePath, kind: "cassette", role: "cassette" },
      { path: result.recordPath, kind: "run-record", role: "record", ok: result.ok },
      { path: result.reportPath, kind: "report", role: "report", ok: result.ok },
      ...result.artifacts.flatMap((artifact) => [
        {
          path: artifact.path,
          kind: artifact.kind,
          role: "artifact",
          ok: artifact.ok,
        },
        {
          path: artifact.diffPath,
          kind: "diff" as const,
          role: "diff",
          ok: artifact.ok,
        },
      ]),
    ],
  });
}

function formatStepLabel(step: AgentFlowStep): string {
  if (step.type === "snapshot") return `snapshot ${step.name}`;
  if (step.type === "waitForText") return `wait ${step.text ?? step.regex ?? ""}`;
  if (step.type === "typeText") return `type ${step.text.slice(0, 24)}`;
  if (step.type === "pressKey") return `press ${step.key}`;
  if (step.type === "click") return `click ${step.selector ?? step.text ?? `${step.x},${step.y}`}`;
  if (step.type === "mark") return `mark ${step.label ?? ""}`;
  if (step.type === "sleep") return `sleep ${step.ms}ms`;
  return step.type;
}

function envTruthy(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "yes";
}

export function printAittyLaunchPlan(input: unknown): string {
  const spec = normalizeAgentFlowSpec(input);
  if ((spec.launch.mode ?? "aitty") !== "aitty") {
    return "launch.mode=url";
  }
  const command = buildAittyExecCommand(spec.launch);
  return [command.file, ...command.args].join(" ");
}

export function defaultSpecNameForPath(path: string): string {
  return sanitizeArtifactName(basename(path, extname(path)));
}
