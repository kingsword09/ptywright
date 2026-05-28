import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { ExtractedStep } from "./step_extractor";
import { buildScript } from "./script_generator_build";
import {
  generateJsonScript,
  generateTypeScriptScript,
  resolveJsonSchemaPath,
} from "./script_generator_format";
import type { GenerateOptions, GeneratedScript } from "./script_generator_types";

export { generateJsonScript, generateTypeScriptScript } from "./script_generator_format";
export type { GenerateOptions, GeneratedScript } from "./script_generator_types";

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
