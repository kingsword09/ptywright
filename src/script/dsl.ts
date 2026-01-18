import { scriptSchema } from "./schema";
import type { Script, ScriptStep } from "./schema";

type SnapshotKey = string;

type SnapshotRef<K extends SnapshotKey> = K | "last";

type StepOf<T extends ScriptStep["type"]> = Extract<ScriptStep, { type: T }>;

type SnapshotStep = StepOf<"snapshot">;
type ExpectStep = StepOf<"expect">;
type ExpectGoldenStep = StepOf<"expectGolden">;
type ExpectMetaStep = StepOf<"expectMeta">;
type WaitForExitStep = StepOf<"waitForExit">;
type SendMouseStep = StepOf<"sendMouse">;

type CustomStepMap = Record<string, unknown>;

export class ScriptBuilder<K extends SnapshotKey = never, Steps extends CustomStepMap = {}> {
  private readonly script: Script;

  constructor(init: {
    name?: string;
    artifactsDir?: string;
    launch: Script["launch"];
    trace?: Script["trace"];
  }) {
    this.script = {
      name: init.name,
      artifactsDir: init.artifactsDir,
      launch: init.launch,
      trace: init.trace,
      steps: [],
    };
  }

  getName(): string | undefined {
    return this.script.name;
  }

  getLaunch(): Script["launch"] {
    return this.script.launch;
  }

  step(step: ScriptStep): this {
    this.script.steps.push(step);
    return this;
  }

  use<NextK extends SnapshotKey, NextSteps extends CustomStepMap = Steps>(
    fn: (s: ScriptBuilder<K, Steps>) => ScriptBuilder<NextK, NextSteps>,
  ): ScriptBuilder<NextK, NextSteps> {
    return fn(this);
  }

  custom<Name extends string>(
    name: Name,
    ...args: Name extends keyof Steps & string
      ? undefined extends Steps[Name]
        ? [payload?: Steps[Name]]
        : [payload: Steps[Name]]
      : [payload?: unknown]
  ): this {
    const payload = args[0] as unknown;
    if (payload === undefined) {
      return this.step({ type: "custom", name });
    }
    return this.step({ type: "custom", name, payload });
  }

  sendText(text: string, options?: { enter?: boolean }): this {
    return this.step({ type: "sendText", text, enter: options?.enter });
  }

  pasteText(text: string, options?: { bracketed?: boolean }): this {
    const bracketed = options?.bracketed ?? false;
    const payload = bracketed ? `\x1b[200~${text}\x1b[201~` : text;
    return this.sendText(payload);
  }

  pressKey(key: string): this {
    return this.step({ type: "pressKey", key });
  }

  sendMouse(step: Omit<SendMouseStep, "type">): this {
    return this.step({ type: "sendMouse", ...step });
  }

  resize(cols: number, rows: number): this {
    return this.step({ type: "resize", cols, rows });
  }

  mark(label?: string): this {
    return this.step({ type: "mark", label });
  }

  sleep(ms: number): this {
    return this.step({ type: "sleep", ms });
  }

  waitForText(step: Omit<StepOf<"waitForText">, "type">): this {
    return this.step({ type: "waitForText", ...step });
  }

  waitForStableScreen(step: Omit<StepOf<"waitForStableScreen">, "type"> = {}): this {
    return this.step({ type: "waitForStableScreen", ...step });
  }

  waitForExit(step: Omit<WaitForExitStep, "type"> = {}): this {
    return this.step({ type: "waitForExit", ...step });
  }

  expectMeta(step: Omit<ExpectMetaStep, "type">): this {
    return this.step({ type: "expectMeta", ...step });
  }

  snapshot<K2 extends string>(
    step: Omit<SnapshotStep, "type"> & { saveAs: K2 },
  ): ScriptBuilder<K | K2, Steps>;
  snapshot(step: Omit<SnapshotStep, "type">): ScriptBuilder<K, Steps>;
  snapshot(step: Omit<SnapshotStep, "type">): ScriptBuilder<any, Steps> {
    this.step({ type: "snapshot", ...step });
    return this as any;
  }

  snapshotText<K2 extends string>(
    step: Omit<SnapshotStep, "type" | "kind"> & { saveAs: K2 },
  ): ScriptBuilder<K | K2, Steps>;
  snapshotText(step?: Omit<SnapshotStep, "type" | "kind">): ScriptBuilder<K, Steps>;
  snapshotText(step: Omit<SnapshotStep, "type" | "kind"> = {}): ScriptBuilder<any, Steps> {
    return this.snapshot({ ...step, kind: "text" } as Omit<SnapshotStep, "type">);
  }

  snapshotView<K2 extends string>(
    step: Omit<SnapshotStep, "type" | "kind"> & { saveAs: K2 },
  ): ScriptBuilder<K | K2, Steps>;
  snapshotView(step?: Omit<SnapshotStep, "type" | "kind">): ScriptBuilder<K, Steps>;
  snapshotView(step: Omit<SnapshotStep, "type" | "kind"> = {}): ScriptBuilder<any, Steps> {
    return this.snapshot({ ...step, kind: "view" } as Omit<SnapshotStep, "type">);
  }

  snapshotAnsi<K2 extends string>(
    step: Omit<SnapshotStep, "type" | "kind"> & { saveAs: K2 },
  ): ScriptBuilder<K | K2, Steps>;
  snapshotAnsi(step?: Omit<SnapshotStep, "type" | "kind">): ScriptBuilder<K, Steps>;
  snapshotAnsi(step: Omit<SnapshotStep, "type" | "kind"> = {}): ScriptBuilder<any, Steps> {
    return this.snapshot({ ...step, kind: "ansi" } as Omit<SnapshotStep, "type">);
  }

  snapshotViewAnsi<K2 extends string>(
    step: Omit<SnapshotStep, "type" | "kind"> & { saveAs: K2 },
  ): ScriptBuilder<K | K2, Steps>;
  snapshotViewAnsi(step?: Omit<SnapshotStep, "type" | "kind">): ScriptBuilder<K, Steps>;
  snapshotViewAnsi(step: Omit<SnapshotStep, "type" | "kind"> = {}): ScriptBuilder<any, Steps> {
    return this.snapshot({ ...step, kind: "view_ansi" } as Omit<SnapshotStep, "type">);
  }

  snapshotGrid<K2 extends string>(
    step: Omit<SnapshotStep, "type" | "kind"> & { saveAs: K2 },
  ): ScriptBuilder<K | K2, Steps>;
  snapshotGrid(step?: Omit<SnapshotStep, "type" | "kind">): ScriptBuilder<K, Steps>;
  snapshotGrid(step: Omit<SnapshotStep, "type" | "kind"> = {}): ScriptBuilder<any, Steps> {
    return this.snapshot({ ...step, kind: "grid" } as Omit<SnapshotStep, "type">);
  }

  expect(step: Omit<ExpectStep, "type" | "from"> & { from?: SnapshotRef<K> }): this {
    return this.step({ type: "expect", ...(step as Omit<ExpectStep, "type">) });
  }

  expectGolden(step: Omit<ExpectGoldenStep, "type" | "from"> & { from?: SnapshotRef<K> }): this {
    return this.step({ type: "expectGolden", ...(step as Omit<ExpectGoldenStep, "type">) });
  }

  build(): Script {
    return scriptSchema.parse(this.script) as Script;
  }
}

export function defineScript<K extends SnapshotKey, Steps extends CustomStepMap>(
  build: () => ScriptBuilder<K, Steps> | Script,
): Script {
  const value = build();
  const script =
    typeof value === "object" && value && "build" in value
      ? (value as ScriptBuilder<any, any>).build()
      : value;
  return scriptSchema.parse(script) as Script;
}
