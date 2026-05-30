import type { AgentViewport } from "./schema";
import type { ResolvedPtywrightConfig } from "../config";
import { readFlagValueFromArgSets, readReportLaunchArgSets } from "./report_launch_args";
import {
  resolveStableFrameConfig,
  shouldUsePtyReplayStableFrameDomPreview,
} from "./report_stable_frame_config";
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

export function resolveReportViewOptions(
  result: AgentRunResult,
  config?: ResolvedPtywrightConfig,
): AgentReportViewOptions {
  const launchArgSets = readReportLaunchArgSets(result);
  const ptyReplayArg = readFlagValueFromArgSets(launchArgSets, "--pty-replay");
  const screenModeArg = readFlagValueFromArgSets(launchArgSets, "--experimental-screen-mode");
  const themeArg = readFlagValueFromArgSets(launchArgSets, "--theme");
  const fontSizeArg = readFlagValueFromArgSets(launchArgSets, "--font-size");
  const lineHeightArg = readFlagValueFromArgSets(launchArgSets, "--line-height");
  const stableFrameConfig = resolveStableFrameConfig(config, result.name);
  const themeOverride =
    ptyReplayArg && shouldUsePtyReplayStableFrameDomPreview({ config, flowName: result.name })
      ? stableFrameConfig.theme
      : undefined;

  return {
    fontSize: parsePositiveNumber(fontSizeArg) ?? 15,
    lineHeight: parsePositiveNumber(lineHeightArg) ?? 1.6,
    screenMode: screenModeArg && screenModeArg !== "termvision" ? "plain" : "termvision",
    theme: themeOverride ?? (themeArg === "light" ? "light" : "dark"),
  };
}

function parsePositiveNumber(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
