import { existsSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { AgentTextMaskRule, AgentViewport } from "./agent/schema";

export type PtywrightAgentDefaults = {
  headless?: boolean;
  timeoutMs?: number;
  screenshot?: boolean;
  viewports?: AgentViewport[];
  mask?: AgentTextMaskRule[];
};

export type PtywrightAgentReportStableFrameFlowConfig = {
  cols?: number;
  enabled?: boolean;
  frameIndex?: number;
  matchMode?: "first" | "last";
  matchRegex?: string | string[];
  matchText?: string | string[];
  rows?: number;
  skip?: boolean;
  stableMs?: number;
  theme?: "dark" | "light";
  viewportOnly?: boolean;
  viewportTargets?: Record<string, number | null | undefined>;
};

export type PtywrightAgentReportStableFrameConfig = PtywrightAgentReportStableFrameFlowConfig & {
  flows?: Record<string, PtywrightAgentReportStableFrameFlowConfig>;
};

export type PtywrightAgentReportConfig = {
  stableFrames?: PtywrightAgentReportStableFrameConfig;
};

export type PtywrightAgentConfig = {
  artifactsRoot?: string;
  cassetteDir?: string;
  report?: PtywrightAgentReportConfig;
  snapshotDir?: string;
  defaults?: PtywrightAgentDefaults;
};

export type PtywrightConfig = {
  agent?: PtywrightAgentConfig;
};

export type ResolvedPtywrightConfig = PtywrightConfig & {
  configPath?: string;
  rootDir: string;
};

const CONFIG_FILE_NAMES = [
  "ptywright.config.ts",
  "ptywright.config.mts",
  "ptywright.config.cts",
  "ptywright.config.js",
  "ptywright.config.mjs",
  "ptywright.config.cjs",
] as const;

export function defineConfig(config: PtywrightConfig): PtywrightConfig {
  return config;
}

export async function loadPtywrightConfig(
  options: {
    configPath?: string;
    cwd?: string;
  } = {},
): Promise<ResolvedPtywrightConfig> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const configPath = resolveConfigPath({ cwd, configPath: options.configPath });

  if (!configPath) {
    return { rootDir: cwd };
  }

  const mod = (await import(`${pathToFileURL(configPath).href}?t=${Date.now()}`)) as {
    default?: unknown;
    config?: unknown;
  };
  const config = normalizePtywrightConfig(mod.default ?? mod.config, configPath);
  return {
    ...config,
    configPath,
    rootDir: dirname(configPath),
  };
}

function resolveConfigPath(options: { cwd: string; configPath?: string }): string | undefined {
  if (options.configPath) {
    const explicitPath = isAbsolute(options.configPath)
      ? options.configPath
      : resolve(options.cwd, options.configPath);
    if (!existsSync(explicitPath)) {
      throw new Error(`ptywright config not found: ${options.configPath}`);
    }
    return explicitPath;
  }

  let current = options.cwd;
  while (true) {
    for (const fileName of CONFIG_FILE_NAMES) {
      const candidate = resolve(current, fileName);
      if (existsSync(candidate)) {
        return candidate;
      }
    }

    const parent = dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

function normalizePtywrightConfig(input: unknown, configPath: string): PtywrightConfig {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error(`invalid ptywright config: expected object in ${configPath}`);
  }

  return input as PtywrightConfig;
}
