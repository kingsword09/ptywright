import type { ExtractedStep } from "./step_extractor";
import type { GenerateOptions } from "./script_generator_types";
import type { Script, ScriptStep } from "../script/schema";

export function buildScript(steps: ExtractedStep[], options: GenerateOptions): Script {
  const launch = resolveLaunch(options);
  const scriptSteps = steps.map(convertToScriptStep);

  if (!hasSnapshotStep(scriptSteps) && scriptSteps.length > 0) {
    scriptSteps.push({
      type: "snapshot",
      kind: "view",
      scope: "visible",
      trimRight: true,
      trimBottom: true,
    });
  }

  return {
    name: options.name,
    launch,
    trace: options.trace ?? {
      saveCast: true,
      saveReport: true,
    },
    steps: scriptSteps,
  };
}

function resolveLaunch(options: GenerateOptions): Script["launch"] {
  if (options.targetCommand) {
    return {
      command: options.targetCommand,
      args: options.targetArgs,
      cols: options.cols ?? 80,
      rows: options.rows ?? 24,
      env: options.env,
    };
  }

  if (options.launch) {
    return {
      command: options.launch.command,
      args: options.launch.args,
      cwd: options.launch.cwd,
      cols: options.cols ?? 80,
      rows: options.rows ?? 24,
      env: options.env ?? options.launch.env,
    };
  }

  return {
    command: "bash",
    cols: options.cols ?? 80,
    rows: options.rows ?? 24,
  };
}

function convertToScriptStep(extracted: ExtractedStep): ScriptStep {
  const { type, params } = extracted;

  switch (type) {
    case "sendText":
      return {
        type: "sendText",
        text: typeof params.text === "string" ? params.text : "",
        enter: params.enter as boolean | undefined,
      };

    case "pressKey":
      return {
        type: "pressKey",
        key: typeof params.key === "string" ? params.key : "Enter",
      };

    case "waitForText":
      return {
        type: "waitForText",
        text: params.text as string | undefined,
        regex: params.regex as string | undefined,
        scope: (params.scope as "visible" | "buffer") ?? "visible",
        timeoutMs: (params.timeoutMs as number) ?? 10000,
      };

    case "waitForStableScreen":
      return {
        type: "waitForStableScreen",
        timeoutMs: (params.timeoutMs as number) ?? 5000,
        quietMs: (params.quietMs as number) ?? 300,
      };

    case "assert":
      return {
        type: "assert",
        text: params.text as string | undefined,
        regex: params.regex as string | undefined,
        description: params.description as string | undefined,
      };

    case "sleep":
      return {
        type: "sleep",
        ms: (params.ms as number) ?? 1000,
      };

    case "snapshot":
      return {
        type: "snapshot",
        kind: (params.kind as "text" | "view" | "ansi" | "view_ansi" | "grid") ?? "view",
        scope: (params.scope as "visible" | "buffer") ?? "visible",
        trimRight: true,
        trimBottom: true,
      };

    default:
      return {
        type: "sendText",
        text: typeof params.text === "string" ? params.text : (extracted.rawText ?? ""),
        enter: true,
      };
  }
}

function hasSnapshotStep(steps: ScriptStep[]): boolean {
  return steps.some(
    (step) => step.type === "snapshot" || step.type === "expect" || step.type === "expectGolden",
  );
}
