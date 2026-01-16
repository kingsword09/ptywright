import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, resolve } from "node:path";

import { SessionManager } from "../session/session_manager";
import { formatSnapshotView } from "../terminal/view";
import { generateTraceReportHtml } from "../trace/report";

import type { TextMaskRule } from "../terminal/mask";
import { scenarioSchema } from "./schema";
import type { Scenario, ScenarioStep } from "./schema";

type RunScenarioOptions = {
  artifactsDir?: string;
  updateGoldens?: boolean;
};

type SnapshotRecord = {
  kind: string;
  hash: string;
  text: string;
};

export async function runScenarioFile(
  scenarioPath: string,
  options?: RunScenarioOptions,
): Promise<{ ok: true; artifactsDir: string }> {
  const raw = await Bun.file(scenarioPath).text();
  const parsed = scenarioSchema.parse(JSON.parse(raw)) as Scenario;

  const scenarioName = parsed.name ?? basename(scenarioPath, extname(scenarioPath));
  const artifactsDir = resolveArtifactsDir(parsed, scenarioName, options?.artifactsDir);

  mkdirSync(artifactsDir, { recursive: true });

  const sessions = new SessionManager({ snapshotRingSize: 50 });
  const launch = parsed.launch;
  // Resolve relative paths from the runner's working directory (not the scenario file).
  const cwd = launch.cwd ? resolve(process.cwd(), launch.cwd) : process.cwd();

  const session = sessions.launchSession({
    command: launch.command,
    args: launch.args ?? [],
    cwd,
    env: launch.env,
    cols: launch.cols,
    rows: launch.rows,
    name: launch.name,
  });

  const snapshots = new Map<string, SnapshotRecord>();
  let last: SnapshotRecord | null = null;

  const resolveGoldenPath = (path: string) =>
    isAbsolute(path) ? path : resolve(process.cwd(), path);
  const resolveArtifactPath = (path: string) =>
    isAbsolute(path) ? path : resolve(artifactsDir, path);

  const trace = parsed.trace ?? {};
  const saveCast = trace.saveCast ?? true;
  const saveReport = trace.saveReport ?? true;
  const castPath = resolveArtifactPath(trace.castPath ?? `${scenarioName}.cast`);
  const reportPath = resolveArtifactPath(trace.reportPath ?? `${scenarioName}.report.html`);

  try {
    for (let stepIndex = 0; stepIndex < parsed.steps.length; stepIndex += 1) {
      const step = parsed.steps[stepIndex] as ScenarioStep;
      last = await runStep({
        step,
        stepIndex,
        session,
        snapshots,
        last,
        resolveGoldenPath,
        resolveArtifactPath,
        updateGoldens: options?.updateGoldens ?? envTruthy(process.env.UPDATE_GOLDENS),
      });
    }

    await writeTraceArtifacts({
      session,
      saveCast,
      castPath,
      saveReport,
      reportPath,
      reportScope: trace.reportScope,
      reportMaxFrames: trace.reportMaxFrames,
    });

    sessions.closeAll();
    return { ok: true, artifactsDir };
  } catch (error) {
    try {
      if (last) {
        writeFileSync(join(artifactsDir, "failure.last.txt"), `${last.text}\n`, "utf8");
      }
      await writeTraceArtifacts({
        session,
        saveCast,
        castPath,
        saveReport,
        reportPath,
        reportScope: trace.reportScope,
        reportMaxFrames: trace.reportMaxFrames,
      });
    } catch {
      // ignore best-effort artifact writing
    } finally {
      sessions.closeAll();
    }

    throw error;
  }
}

function resolveArtifactsDir(scenario: Scenario, scenarioName: string, override?: string): string {
  if (override?.trim()) return resolve(override.trim());
  if (scenario.artifactsDir?.trim()) return resolve(scenario.artifactsDir.trim());
  return resolve(".tmp", "scenarios", scenarioName);
}

async function runStep(args: {
  step: ScenarioStep;
  stepIndex: number;
  session: ReturnType<SessionManager["launchSession"]>;
  snapshots: Map<string, SnapshotRecord>;
  last: SnapshotRecord | null;
  resolveGoldenPath: (path: string) => string;
  resolveArtifactPath: (path: string) => string;
  updateGoldens: boolean;
}): Promise<SnapshotRecord | null> {
  const { step } = args;

  if (step.type === "sendText") {
    args.session.sendText(step.text, { enter: step.enter });
    return args.last;
  }

  if (step.type === "pressKey") {
    args.session.pressKey(step.key);
    return args.last;
  }

  if (step.type === "resize") {
    args.session.resize(step.cols, step.rows);
    return args.last;
  }

  if (step.type === "mark") {
    args.session.mark(step.label);
    return args.last;
  }

  if (step.type === "waitForText") {
    const regex = step.regex ? new RegExp(step.regex) : undefined;
    const result = await args.session.waitForText({
      scope: step.scope,
      text: step.text,
      regex,
      timeoutMs: step.timeoutMs ?? 10_000,
      intervalMs: step.intervalMs ?? 100,
    });
    if (!result.found) {
      throw new Error(
        `step ${args.stepIndex + 1} waitForText not found: ${step.text ?? step.regex ?? ""}`,
      );
    }
    return args.last;
  }

  if (step.type === "waitForStableScreen") {
    const result = await args.session.waitForStableScreen({
      timeoutMs: step.timeoutMs ?? 10_000,
      quietMs: step.quietMs ?? 400,
      intervalMs: step.intervalMs ?? 80,
    });
    if (!result.stable) {
      throw new Error(`step ${args.stepIndex + 1} waitForStableScreen timed out`);
    }
    return args.last;
  }

  if (step.type === "snapshot") {
    const record = await snapshotStep(args.session, step);
    const saveAs = step.saveAs?.trim();
    if (saveAs) {
      args.snapshots.set(saveAs, record);
    }
    const saveTo = step.saveTo?.trim();
    if (saveTo) {
      const path = args.resolveArtifactPath(saveTo);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, `${record.text}\n`, "utf8");
    }
    return record;
  }

  if (step.type === "expect") {
    const record = selectSnapshot(args.last, args.snapshots, step.from);
    assertRecordMatches(record, step, args.stepIndex);
    return args.last;
  }

  if (step.type === "expectGolden") {
    const record = selectSnapshot(args.last, args.snapshots, step.from);
    const goldenPath = args.resolveGoldenPath(step.path);
    assertGoldenText(goldenPath, `${record.text}\n`, args.updateGoldens);
    return args.last;
  }

  return args.last;
}

function selectSnapshot(
  last: SnapshotRecord | null,
  snapshots: Map<string, SnapshotRecord>,
  from?: string,
): SnapshotRecord {
  const key = from?.trim() ? from.trim() : "last";
  if (key === "last") {
    if (!last) throw new Error("expect: no previous snapshot (from=last)");
    return last;
  }

  const found = snapshots.get(key);
  if (!found) {
    throw new Error(`expect: unknown snapshot reference: ${key}`);
  }
  return found;
}

function assertRecordMatches(
  record: SnapshotRecord,
  step: Extract<ScenarioStep, { type: "expect" }>,
  stepIndex: number,
): void {
  if (step.equals !== undefined && record.text !== step.equals) {
    throw new Error(`step ${stepIndex + 1} expect.equals failed`);
  }

  if (step.contains && step.contains.length > 0) {
    for (const item of step.contains) {
      if (!record.text.includes(item)) {
        throw new Error(`step ${stepIndex + 1} expect.contains failed: ${JSON.stringify(item)}`);
      }
    }
  }

  if (step.notContains && step.notContains.length > 0) {
    for (const item of step.notContains) {
      if (record.text.includes(item)) {
        throw new Error(`step ${stepIndex + 1} expect.notContains failed: ${JSON.stringify(item)}`);
      }
    }
  }

  if (step.regex) {
    const regex = new RegExp(step.regex);
    if (!regex.test(record.text)) {
      throw new Error(`step ${stepIndex + 1} expect.regex failed: ${JSON.stringify(step.regex)}`);
    }
  }
}

function assertGoldenText(path: string, text: string, update: boolean): void {
  if (update) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text, "utf8");
    return;
  }

  const expected = readFileSync(path, "utf8");
  if (text !== expected) {
    throw new Error(`golden mismatch: ${path}`);
  }
}

async function snapshotStep(
  session: ReturnType<SessionManager["launchSession"]>,
  step: Extract<ScenarioStep, { type: "snapshot" }>,
): Promise<SnapshotRecord> {
  if (step.kind === "grid") {
    if (step.mask && step.mask.length > 0) {
      throw new Error("snapshot.kind=grid does not support mask (use text/view instead)");
    }
    const { grid, hash } = await session.snapshotGrid({
      trimRight: step.trimRight,
      includeStyles: step.includeStyles,
      captureFrame: true,
    });
    return { kind: step.kind, hash, text: JSON.stringify(grid, null, 2) };
  }

  if (step.kind === "ansi" || step.kind === "view_ansi") {
    const { ansi, hash } = await session.snapshotAnsi({
      scope: step.scope,
      trimRight: step.trimRight,
      trimBottom: step.trimBottom ?? true,
      maxLines: step.maxLines,
      tailLines: step.tailLines,
      mask: step.mask as TextMaskRule[] | undefined,
    });

    if (step.kind === "ansi") {
      return { kind: step.kind, hash, text: ansi };
    }

    const lines = ansi.split("\n");
    const view = formatSnapshotView({
      sessionId: session.id,
      scope: step.scope ?? "visible",
      hash,
      lines,
      meta: session.getMeta(),
      lineNumbers: step.lineNumbers,
    });
    return { kind: step.kind, hash, text: view };
  }

  const { text, hash } = await session.snapshotText({
    scope: step.scope,
    trimRight: step.trimRight,
    trimBottom: step.trimBottom ?? true,
    maxLines: step.maxLines,
    tailLines: step.tailLines,
    captureFrame: true,
    mask: step.mask as TextMaskRule[] | undefined,
  });

  if (step.kind === "text") {
    return { kind: step.kind, hash, text };
  }

  const lines = text.split("\n");
  const view = formatSnapshotView({
    sessionId: session.id,
    scope: step.scope ?? "visible",
    hash,
    lines,
    meta: session.getMeta(),
    lineNumbers: step.lineNumbers,
  });
  return { kind: step.kind, hash, text: view };
}

async function writeTraceArtifacts(args: {
  session: ReturnType<SessionManager["launchSession"]>;
  saveCast: boolean;
  castPath: string;
  saveReport: boolean;
  reportPath: string;
  reportScope?: "visible" | "buffer";
  reportMaxFrames?: number;
}): Promise<void> {
  if (!args.saveCast && !args.saveReport) return;

  const snapshot = await args.session.snapshotCast();

  if (args.saveCast) {
    mkdirSync(dirname(args.castPath), { recursive: true });
    writeFileSync(args.castPath, snapshot.cast, "utf8");
  }

  if (args.saveReport) {
    const html = await generateTraceReportHtml(snapshot.cast, {
      scope: args.reportScope,
      maxFrames: args.reportMaxFrames,
    });
    mkdirSync(dirname(args.reportPath), { recursive: true });
    writeFileSync(args.reportPath, html, "utf8");
  }
}

function envTruthy(value: string | undefined): boolean {
  const v = value?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}
