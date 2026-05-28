import type { ScriptStep } from "../script/schema";

export type ExtractedStep = {
  type: ScriptStep["type"];
  params: Record<string, unknown>;
  source: "code_block" | "text_step" | "inferred";
  confidence: "high" | "medium" | "low";
  rawText?: string;
};

export type ExtractedLaunch = {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  confidence: "high" | "medium" | "low";
};

export type ExtractionResult = {
  launch?: ExtractedLaunch;
  steps: ExtractedStep[];
  warnings: string[];
};
