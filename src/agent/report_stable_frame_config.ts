import type { PtywrightAgentReportStableFrameFlowConfig, ResolvedPtywrightConfig } from "../config";

export type PtyReplayStableFramePreviewSource = "captured-dom" | "pty-replay";

export type ResolvedStableFrameConfig = Required<
  Pick<PtywrightAgentReportStableFrameFlowConfig, "stableMs" | "theme" | "viewportOnly">
> &
  Omit<PtywrightAgentReportStableFrameFlowConfig, "stableMs" | "theme" | "viewportOnly"> & {
    previewSource: PtyReplayStableFramePreviewSource;
  };

export function resolveStableFrameConfig(
  config: ResolvedPtywrightConfig | undefined,
  flowName: string,
): ResolvedStableFrameConfig {
  const stableFrames = config?.agent?.report?.stableFrames;
  const flowConfig = stableFrames?.flows?.[flowName];

  return {
    ...stableFrames,
    ...flowConfig,
    previewSource: flowConfig?.previewSource ?? stableFrames?.previewSource ?? "captured-dom",
    stableMs: flowConfig?.stableMs ?? stableFrames?.stableMs ?? 200,
    theme: flowConfig?.theme ?? stableFrames?.theme ?? "dark",
    viewportOnly: flowConfig?.viewportOnly ?? stableFrames?.viewportOnly ?? false,
    viewportTargets: {
      ...stableFrames?.viewportTargets,
      ...flowConfig?.viewportTargets,
    },
  };
}

export function shouldUsePtyReplayStableFrameDomPreview(args: {
  config?: ResolvedPtywrightConfig;
  flowName: string;
}): boolean {
  const config = resolveStableFrameConfig(args.config, args.flowName);
  return config.enabled !== false && !config.skip && config.previewSource === "pty-replay";
}
