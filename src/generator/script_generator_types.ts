import type { ExtractedLaunch } from "./step_extractor";
import type { Script } from "../script/schema";

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
