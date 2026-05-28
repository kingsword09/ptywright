import { readFileSync } from "node:fs";

import type { AgentViewport } from "./schema";
import type { AgentRunResult } from "./runner";

export type AgentReportScreenMode = "plain" | "termvision";
export type AgentReportTheme = "dark" | "light";

export type AgentReportViewOptions = {
  fontSize: number;
  lineHeight: number;
  screenMode: AgentReportScreenMode;
  theme: AgentReportTheme;
};

export function isMobileViewport(viewport?: AgentViewport): boolean {
  return Boolean(viewport?.isMobile || viewport?.hasTouch || (viewport?.width ?? 9999) <= 720);
}

export function resolveReportViewOptions(result: AgentRunResult): AgentReportViewOptions {
  const launchArgSets = [
    readFlowLaunchArgs(result.flowPath),
    readCassetteLaunchArgs(result.replaySourceCassettePath ?? result.cassettePath),
  ];
  const screenModeArg = readFlagValueFromArgSets(launchArgSets, "--experimental-screen-mode");
  const themeArg = readFlagValueFromArgSets(launchArgSets, "--theme");
  const fontSizeArg = readFlagValueFromArgSets(launchArgSets, "--font-size");
  const lineHeightArg = readFlagValueFromArgSets(launchArgSets, "--line-height");

  return {
    fontSize: parsePositiveNumber(fontSizeArg) ?? 15,
    lineHeight: parsePositiveNumber(lineHeightArg) ?? 1.6,
    screenMode: screenModeArg && screenModeArg !== "termvision" ? "plain" : "termvision",
    theme: themeArg === "light" ? "light" : "dark",
  };
}

function readCassetteLaunchArgs(cassettePath: string): string[] {
  try {
    const raw = JSON.parse(readFileSync(cassettePath, "utf8")) as {
      spec?: { launch?: { args?: unknown } };
    };
    return normalizeStringArray(raw.spec?.launch?.args);
  } catch {
    return [];
  }
}

function readFlowLaunchArgs(flowPath: string): string[] {
  try {
    const raw = JSON.parse(readFileSync(flowPath, "utf8")) as {
      launch?: { args?: unknown };
    };
    return normalizeStringArray(raw.launch?.args);
  } catch {
    return [];
  }
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function readFlagValueFromArgSets(
  argSets: readonly (readonly string[])[],
  flag: string,
): string | undefined {
  for (const args of argSets) {
    const value = readFlagValue(args, flag);
    if (value !== undefined) return value;
  }
  return undefined;
}

function readFlagValue(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function parsePositiveNumber(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
