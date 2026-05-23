import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { chromium, type Browser, type Page } from "playwright";

import { buildAittyExecCommand, launchAittyBrowserSession } from "./aitty";
import {
  normalizeDomSnapshot,
  normalizeTerminalText,
  sanitizeArtifactName,
  shortHash,
} from "./normalize";
import { writeAgentReport } from "./report";
import {
  normalizeAgentFlowSpec,
  type AgentFlowSpec,
  type AgentFlowStep,
  type AgentTextMaskRule,
  type AgentViewport,
} from "./schema";

export type AgentRunnerOptions = {
  artifactsDir?: string;
  updateSnapshots?: boolean;
  headless?: boolean;
  rootDir?: string;
};

export type AgentRunArtifact = {
  name: string;
  viewport: string;
  kind: "terminal" | "dom" | "screenshot";
  path: string;
  baselinePath?: string;
  hash?: string;
  ok: boolean;
  error?: string;
};

export type AgentRecordedStep = {
  index: number;
  type: AgentFlowStep["type"];
  label: string;
  durationMs: number;
  ok: boolean;
  error?: string;
};

export type AgentRunResult = {
  ok: boolean;
  name: string;
  startedAt: number;
  durationMs: number;
  artifactsDir: string;
  snapshotDir: string;
  reportPath: string;
  recordPath: string;
  flowPath: string;
  replayCommand: string;
  viewports: AgentViewport[];
  steps: AgentRecordedStep[];
  artifacts: AgentRunArtifact[];
  errors: string[];
};

type LoadedAgentSpec = {
  spec: AgentFlowSpec;
  path: string;
};

type RunContext = {
  spec: AgentFlowSpec;
  viewport: AgentViewport;
  page: Page;
  artifactsDir: string;
  snapshotDir: string;
  updateSnapshots: boolean;
  masks: readonly AgentTextMaskRule[];
  artifacts: AgentRunArtifact[];
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
  const record = JSON.parse(readFileSync(recordPath, "utf8")) as {
    flowPath?: unknown;
    spec?: unknown;
  };
  if (typeof record.flowPath !== "string") {
    if (record.spec && typeof record.spec === "object") {
      return runAgentSpec(record.spec, options);
    }
    throw new Error(`invalid agent record: missing flowPath in ${recordPath}`);
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
  const updateSnapshots = options.updateSnapshots ?? envTruthy(process.env.UPDATE_SNAPSHOTS);

  mkdirSync(artifactsDir, { recursive: true });
  mkdirSync(snapshotDir, { recursive: true });

  const result: AgentRunResult = {
    ok: true,
    name,
    startedAt,
    durationMs: 0,
    artifactsDir,
    snapshotDir,
    reportPath,
    recordPath,
    flowPath,
    replayCommand: `ptywright agent replay ${relative(process.cwd(), recordPath)}`,
    viewports: spec.viewports ?? [],
    steps: [],
    artifacts: [],
    errors: [],
  };

  writeFileSync(flowPath, JSON.stringify(spec, null, 2) + "\n", "utf8");

  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({ headless: options.headless ?? true });

    for (const viewport of spec.viewports ?? []) {
      await runViewport({
        browser,
        spec,
        viewport,
        rootDir,
        artifactsDir,
        snapshotDir,
        updateSnapshots,
        result,
      });
    }
  } catch (error) {
    result.ok = false;
    result.errors.push(error instanceof Error ? error.message : String(error));
  } finally {
    await browser?.close();
    result.durationMs = Date.now() - startedAt;
    writeRunRecord(result, spec);
    writeAgentReport(reportPath, result);
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
  result: AgentRunResult;
}): Promise<void> {
  const { browser, spec, viewport, rootDir, artifactsDir, snapshotDir, updateSnapshots, result } =
    args;
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
    masks: spec.defaults?.mask ?? [],
    artifacts: result.artifacts,
  };

  try {
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: spec.defaults?.timeoutMs ?? 30_000,
    });
    await waitForTerminalRoot(page, spec.defaults?.timeoutMs ?? 30_000);

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
    await context.close();
    await session?.close();
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
    const root = ctx.page.locator("[data-terminal-root]").first();
    await root.click({ timeout });
    await ctx.page.keyboard.type(step.text, { delay: step.delayMs });
    if (step.enter) {
      await ctx.page.keyboard.press("Enter");
    }
    return;
  }

  if (step.type === "pressKey") {
    await ctx.page.keyboard.press(step.key);
    return;
  }

  if (step.type === "click") {
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
    await new Promise((resolveSleep) => setTimeout(resolveSleep, step.ms));
    return;
  }

  if (step.type === "mark") {
    return;
  }
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
    content: string;
    compare: boolean;
  },
): Promise<void> {
  const artifactPath = join(ctx.artifactsDir, artifact.relativePath);
  const baselinePath = join(ctx.snapshotDir, artifact.baselineRelativePath);
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
    const current = await readTerminalDom(page);
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
  return page
    .locator("[data-terminal-root]")
    .first()
    .evaluate((node) => {
      const rows = Array.from(node.querySelectorAll(".term-grid .term-row"));
      if (rows.length > 0) {
        return rows.map((row) => row.textContent ?? "").join("\n");
      }
      return node.textContent ?? "";
    });
}

async function readTerminalDom(page: Page): Promise<string> {
  return page
    .locator("[data-terminal-root]")
    .first()
    .evaluate((node) => node.innerHTML);
}

async function loadAgentSpec(specPath: string): Promise<LoadedAgentSpec> {
  const resolved = resolve(process.cwd(), specPath);
  if (resolved.endsWith(".json")) {
    return {
      spec: normalizeAgentFlowSpec(JSON.parse(readFileSync(resolved, "utf8"))),
      path: resolved,
    };
  }

  const mod = (await import(`${pathToFileURL(resolved).href}?t=${Date.now()}`)) as {
    default?: unknown;
    spec?: unknown;
  };
  return {
    spec: normalizeAgentFlowSpec(mod.default ?? mod.spec),
    path: resolved,
  };
}

function writeRunRecord(result: AgentRunResult, spec: AgentFlowSpec): void {
  const record = {
    version: 1,
    name: result.name,
    ok: result.ok,
    startedAt: new Date(result.startedAt).toISOString(),
    durationMs: result.durationMs,
    spec,
    flowPath: relative(dirname(result.recordPath), result.flowPath),
    artifactsDir: result.artifactsDir,
    snapshotDir: result.snapshotDir,
    reportPath: result.reportPath,
    replayCommand: result.replayCommand,
    steps: result.steps,
    artifacts: result.artifacts,
    errors: result.errors,
  };

  writeFileSync(result.recordPath, JSON.stringify(record, null, 2) + "\n", "utf8");
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
