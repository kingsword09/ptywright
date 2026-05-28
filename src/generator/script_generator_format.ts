import { relative, resolve } from "node:path";

import type { Script } from "../script/schema";

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

export function resolveJsonSchemaPath(outputDir: string): string {
  const absOutputDir = resolve(process.cwd(), outputDir);
  const absSchemaPath = resolve(process.cwd(), "schemas", "ptywright-script.schema.json");

  let schemaPath = relative(absOutputDir, absSchemaPath);
  if (!schemaPath.startsWith(".")) {
    schemaPath = `./${schemaPath}`;
  }
  return schemaPath.replaceAll("\\", "/");
}
