import { readFileSync } from "node:fs";

import type { AgentRunResult } from "./runner";

export function readReportLaunchArgSets(result: AgentRunResult): string[][] {
  return [
    readFlowLaunchArgs(result.flowPath),
    readCassetteLaunchArgs(result.replaySourceCassettePath ?? result.cassettePath),
  ];
}

export function readFlagValueFromArgSets(
  argSets: readonly (readonly string[])[],
  flag: string,
): string | undefined {
  for (const args of argSets) {
    const value = readFlagValue(args, flag);
    if (value !== undefined) return value;
  }
  return undefined;
}

export function readFlagValue(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
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
