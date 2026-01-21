import { mkdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import type { ExtractedStep, ExtractedLaunch } from "./step_extractor";
import type { Script, ScriptStep } from "../script/schema";

export type GenerateOptions = {
  name: string;
  launch?: ExtractedLaunch;
  targetCommand?: string;
  targetArgs?: string[];
  outputDir: string;
  format: "json" | "ts" | "both";
  cols?: number;
  rows?: number;
  env?: Record<string, string>;
  trace?: {
    saveCast?: boolean;
    saveReport?: boolean;
  };
};

export type GeneratedScript = {
  name: string;
  jsonPath?: string;
  tsPath?: string;
  script: Script;
  stepCount: number;
};

export function generateScript(steps: ExtractedStep[], options: GenerateOptions): GeneratedScript {
  const script = buildScript(steps, options);

  mkdirSync(options.outputDir, { recursive: true });

  let jsonPath: string | undefined;
  let tsPath: string | undefined;

  if (options.format === "json" || options.format === "both") {
    jsonPath = join(options.outputDir, `${options.name}.json`);
    const jsonContent = generateJsonScript(script, {
      schemaPath: resolveJsonSchemaPath(options.outputDir),
    });
    writeFileSync(jsonPath, jsonContent, "utf8");
  }

  if (options.format === "ts" || options.format === "both") {
    tsPath = join(options.outputDir, `${options.name}.ts`);
    const tsContent = generateTypeScriptScript(script);
    writeFileSync(tsPath, tsContent, "utf8");
  }

  return {
    name: options.name,
    jsonPath,
    tsPath,
    script,
    stepCount: script.steps.length,
  };
}

function buildScript(steps: ExtractedStep[], options: GenerateOptions): Script {
  const launch = resolveLaunch(options);
  const scriptSteps = steps.map(convertToScriptStep);

  // Add final snapshot step if not present
  const hasSnapshot = scriptSteps.some(
    (s) => s.type === "snapshot" || s.type === "expect" || s.type === "expectGolden",
  );
  if (!hasSnapshot && scriptSteps.length > 0) {
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

  // Default to bash for interactive testing
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
      // Fallback to sendText for unknown types
      return {
        type: "sendText",
        text: typeof params.text === "string" ? params.text : (extracted.rawText ?? ""),
        enter: true,
      };
  }
}

export function generateJsonScript(script: Script, options?: { schemaPath?: string }): string {
  const output = {
    $schema: options?.schemaPath ?? "../schemas/ptywright-script.schema.json",
    ...script,
  };

  return JSON.stringify(output, null, 2) + "\n";
}

export function generateTypeScriptScript(script: Script): string {
  return `export default ${JSON.stringify(script, null, 2)};\n`;
}

function resolveJsonSchemaPath(outputDir: string): string {
  const absOutputDir = resolve(process.cwd(), outputDir);
  const absSchemaPath = resolve(process.cwd(), "schemas", "ptywright-script.schema.json");

  let schemaPath = relative(absOutputDir, absSchemaPath);
  if (!schemaPath.startsWith(".")) {
    schemaPath = `./${schemaPath}`;
  }
  return schemaPath.replaceAll("\\", "/");
}
