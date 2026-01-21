import { resolve, basename, extname } from "node:path";

import { parseDocument, type DocumentSource, type ParsedDocument } from "./doc_parser";
import { extractSteps } from "./step_extractor";
import { generateScript } from "./script_generator";

export type GenerateTestOptions = {
  source: string;
  sourceType?: "local" | "url" | "auto";
  outputDir?: string;
  outputFormat?: "json" | "ts" | "both";
  targetCommand?: string;
  targetArgs?: string[];
  name?: string;
  cols?: number;
  rows?: number;
  env?: Record<string, string>;
  trace?: {
    saveCast?: boolean;
    saveReport?: boolean;
  };
};

export type GenerateTestResult = {
  ok: boolean;
  name: string;
  jsonPath?: string;
  tsPath?: string;
  stepCount: number;
  warnings: string[];
  error?: string;
  parsed?: {
    title?: string;
    format: string;
    codeBlockCount: number;
    textStepCount: number;
  };
};

export async function generateTestFromDoc(
  options: GenerateTestOptions,
): Promise<GenerateTestResult> {
  const warnings: string[] = [];

  try {
    // 1. Resolve document source
    const docSource = resolveDocumentSource(options.source, options.sourceType);

    // 2. Parse document
    const parsed = await parseDocument(docSource);

    // 3. Extract steps
    const extraction = extractSteps(parsed);
    warnings.push(...extraction.warnings);

    if (extraction.steps.length === 0) {
      return {
        ok: false,
        name: options.name ?? "unknown",
        stepCount: 0,
        warnings,
        error: "No test steps could be extracted from the document",
        parsed: {
          title: parsed.title,
          format: parsed.format,
          codeBlockCount: parsed.codeBlocks.length,
          textStepCount: parsed.steps.length,
        },
      };
    }

    // 4. Generate script
    const scriptName = resolveScriptName(options.name, options.source, parsed);
    const outputDir = options.outputDir ?? resolve(".tmp", "generated");

    const generated = generateScript(extraction.steps, {
      name: scriptName,
      launch: extraction.launch,
      targetCommand: options.targetCommand,
      targetArgs: options.targetArgs,
      outputDir,
      format: options.outputFormat ?? "both",
      cols: options.cols,
      rows: options.rows,
      env: options.env,
      trace: options.trace,
    });

    return {
      ok: true,
      name: generated.name,
      jsonPath: generated.jsonPath,
      tsPath: generated.tsPath,
      stepCount: generated.stepCount,
      warnings,
      parsed: {
        title: parsed.title,
        format: parsed.format,
        codeBlockCount: parsed.codeBlocks.length,
        textStepCount: parsed.steps.length,
      },
    };
  } catch (error) {
    return {
      ok: false,
      name: options.name ?? "unknown",
      stepCount: 0,
      warnings,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function resolveDocumentSource(
  source: string,
  sourceType?: "local" | "url" | "auto",
): DocumentSource {
  const type = !sourceType || sourceType === "auto" ? detectSourceType(source) : sourceType;

  if (type === "url") {
    return { type: "url", url: source };
  }

  return { type: "local", path: resolve(source) };
}

function detectSourceType(source: string): "local" | "url" {
  if (source.startsWith("http://") || source.startsWith("https://")) {
    return "url";
  }
  return "local";
}

function resolveScriptName(
  explicitName: string | undefined,
  source: string,
  parsed: ParsedDocument,
): string {
  if (explicitName) {
    return sanitizeName(explicitName);
  }

  if (parsed.title) {
    return sanitizeName(parsed.title);
  }

  // Extract from file path
  const base = basename(source, extname(source));
  return sanitizeName(base);
}

function sanitizeName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 64) || "generated_test"
  );
}
