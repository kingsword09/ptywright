import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, resolve } from "node:path";

import { SessionManager } from "../session/session_manager";
import { formatSnapshotView } from "../terminal/view";
import { generateTraceReportHtml } from "../trace/report";

import type { TextMaskRule } from "../terminal/mask";
import { scenarioSchema } from "./schema";
import type { Scenario, ScenarioStep } from "./schema";

export type SnapshotRecord = {
  kind: string;
  hash: string;
  text: string;
};

export type ScenarioCustomStep<Name extends string = string, Payload = unknown> = {
  type: "custom";
  name: Name;
  payload?: Payload;
};

export type ScenarioRunnerContext = {
  session: ReturnType<SessionManager["launchSession"]>;
  stepIndex: number;
  last: SnapshotRecord | null;
  snapshots: Map<string, SnapshotRecord>;
  artifactsDir: string;
  resolveArtifactPath: (path: string) => string;
  resolveGoldenPath: (path: string) => string;
  updateGoldens: boolean;
  captureSnapshot: (
    step: Omit<Extract<ScenarioStep, { type: "snapshot" }>, "type">,
  ) => Promise<SnapshotRecord>;
  getSnapshot: (from?: string) => SnapshotRecord;
  writeArtifactText: (path: string, text: string) => void;
  assertGoldenText: (path: string, text: string) => void;
};

type CustomStepHandlerImpl<Payload> = {
  bivarianceHack(
    ctx: ScenarioRunnerContext,
    step: ScenarioCustomStep<string, Payload>,
  ): Promise<SnapshotRecord | void> | SnapshotRecord | void;
}["bivarianceHack"];

export type CustomStepHandler<Payload = unknown> = CustomStepHandlerImpl<Payload>;

type RunScenarioOptions = {
  artifactsDir?: string;
  updateGoldens?: boolean;
  steps?: Record<string, CustomStepHandler>;
};

export async function runScenarioFile(
  scenarioPath: string,
  options?: RunScenarioOptions,
): Promise<{ ok: true; artifactsDir: string }> {
  const raw = await Bun.file(scenarioPath).text();
  const parsedJson = JSON.parse(raw) as unknown;
  const baseName = basename(scenarioPath, extname(scenarioPath));
  const withName =
    parsedJson &&
    typeof parsedJson === "object" &&
    !Array.isArray(parsedJson) &&
    !("name" in parsedJson)
      ? { ...parsedJson, name: baseName }
      : parsedJson;

  return runScenario(withName, options);
}

export async function runScenario(
  scenario: unknown,
  options?: RunScenarioOptions,
): Promise<{ ok: true; artifactsDir: string }> {
  const parsed = scenarioSchema.parse(scenario) as Scenario;

  const scenarioName = parsed.name ?? "scenario";
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
  let currentStepIndex = -1;
  let currentStep: ScenarioStep | null = null;

  const resolveGoldenPath = (path: string) =>
    isAbsolute(path) ? path : resolve(process.cwd(), path);
  const resolveArtifactPath = (path: string) =>
    isAbsolute(path) ? path : resolve(artifactsDir, path);

  const trace = parsed.trace ?? {};
  const saveCast = trace.saveCast ?? true;
  const saveReport = trace.saveReport ?? true;
  const castPath = resolveArtifactPath(trace.castPath ?? `${scenarioName}.cast`);
  const reportPath = resolveArtifactPath(trace.reportPath ?? `${scenarioName}.report.html`);

  const stepHandlers = options?.steps;

  try {
    for (let stepIndex = 0; stepIndex < parsed.steps.length; stepIndex += 1) {
      const step = parsed.steps[stepIndex] as ScenarioStep;
      currentStepIndex = stepIndex;
      currentStep = step;
      last = await runStep({
        step,
        stepIndex,
        session,
        snapshots,
        last,
        resolveGoldenPath,
        resolveArtifactPath,
        updateGoldens: options?.updateGoldens ?? envTruthy(process.env.UPDATE_GOLDENS),
        stepHandlers,
        artifactsDir,
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
      await writeFailureArtifacts({
        session,
        artifactsDir,
        scenarioName,
        stepIndex: currentStepIndex,
        step: currentStep,
        last,
        error,
      });
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
  stepHandlers?: Record<string, CustomStepHandler>;
  artifactsDir: string;
}): Promise<SnapshotRecord | null> {
  const { step } = args;

  try {
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
      persistSnapshotRecord({
        record,
        saveAs: step.saveAs,
        saveTo: step.saveTo,
        snapshots: args.snapshots,
        resolveArtifactPath: args.resolveArtifactPath,
      });
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

    if (step.type === "custom") {
      const handler = args.stepHandlers?.[step.name];
      if (!handler) {
        throw new Error(`custom handler not found: ${step.name}`);
      }

      const ctx: ScenarioRunnerContext = {
        session: args.session,
        stepIndex: args.stepIndex,
        last: args.last,
        snapshots: args.snapshots,
        artifactsDir: args.artifactsDir,
        resolveArtifactPath: args.resolveArtifactPath,
        resolveGoldenPath: args.resolveGoldenPath,
        updateGoldens: args.updateGoldens,
        captureSnapshot: async (
          snapshotConfig: Omit<Extract<ScenarioStep, { type: "snapshot" }>, "type">,
        ) => {
          const record = await snapshotStep(args.session, {
            type: "snapshot",
            ...snapshotConfig,
          } as Extract<ScenarioStep, { type: "snapshot" }>);

          persistSnapshotRecord({
            record,
            saveAs: snapshotConfig.saveAs,
            saveTo: snapshotConfig.saveTo,
            snapshots: args.snapshots,
            resolveArtifactPath: args.resolveArtifactPath,
          });

          return record;
        },
        getSnapshot: (from?: string) => selectSnapshot(args.last, args.snapshots, from),
        writeArtifactText: (path: string, text: string) => {
          const resolved = args.resolveArtifactPath(path);
          mkdirSync(dirname(resolved), { recursive: true });
          writeFileSync(resolved, text, "utf8");
        },
        assertGoldenText: (path: string, text: string) => {
          const goldenPath = args.resolveGoldenPath(path);
          assertGoldenText(goldenPath, text, args.updateGoldens);
        },
      };

      const result = await handler(ctx, step as ScenarioCustomStep);
      if (!result) return args.last;
      return result;
    }

    throw new Error(`unknown type: ${(step as ScenarioStep).type}`);
  } catch (error) {
    throw annotateStepError(error, args.stepIndex, step);
  }
}

function persistSnapshotRecord(args: {
  record: SnapshotRecord;
  saveAs?: string;
  saveTo?: string;
  snapshots: Map<string, SnapshotRecord>;
  resolveArtifactPath: (path: string) => string;
}): void {
  const saveAs = args.saveAs?.trim();
  if (saveAs) {
    args.snapshots.set(saveAs, args.record);
  }

  const saveTo = args.saveTo?.trim();
  if (!saveTo) return;

  const path = args.resolveArtifactPath(saveTo);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${args.record.text}\n`, "utf8");
}

function annotateStepError(error: unknown, stepIndex: number, step: ScenarioStep): Error {
  const label =
    step.type === "custom"
      ? `custom(${(step as Extract<ScenarioStep, { type: "custom" }>).name})`
      : step.type;
  const prefix = `step ${stepIndex + 1} ${label}`;

  if (error instanceof Error) {
    if (!error.message.startsWith("step ")) {
      error.message = `${prefix}: ${error.message}`;
    }
    return error;
  }

  return new Error(`${prefix}: ${String(error)}`);
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

async function writeFailureArtifacts(args: {
  session: ReturnType<SessionManager["launchSession"]>;
  artifactsDir: string;
  scenarioName: string;
  stepIndex: number;
  step: ScenarioStep | null;
  last: SnapshotRecord | null;
  error: unknown;
}): Promise<void> {
  const { session, artifactsDir, scenarioName, stepIndex, step, last, error } = args;

  const err = error instanceof Error ? error : new Error(String(error));
  const errorText = err.stack ?? err.message;
  writeFileSync(join(artifactsDir, "failure.error.txt"), `${errorText}\n`, "utf8");

  const stepPayload = {
    scenario: scenarioName,
    stepIndex: stepIndex >= 0 ? stepIndex + 1 : null,
    step: step ?? null,
    last: last ? { kind: last.kind, hash: last.hash } : null,
  };
  writeFileSync(
    join(artifactsDir, "failure.step.json"),
    `${JSON.stringify(stepPayload, null, 2)}\n`,
    "utf8",
  );

  let capturedText: string | undefined = undefined;
  let capturedHash: string | undefined = undefined;
  try {
    const captured = await session.snapshotText({
      scope: "visible",
      trimRight: true,
      trimBottom: true,
      captureFrame: true,
    });
    capturedText = captured.text;
    capturedHash = captured.hash;
  } catch {
    // ignore best-effort snapshot on failure
  }

  const text = capturedText ?? last?.text;
  const hash = capturedHash ?? last?.hash ?? "unknown";

  if (text !== undefined) {
    writeFileSync(join(artifactsDir, "failure.last.txt"), `${text}\n`, "utf8");

    const view = formatSnapshotView({
      sessionId: session.id,
      scope: "visible",
      hash,
      lines: text.split("\n"),
      meta: session.getMeta(),
      lineNumbers: true,
    });
    writeFileSync(join(artifactsDir, "failure.last.view.txt"), `${view}\n`, "utf8");
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
