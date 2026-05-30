import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

export type AgentReportAittyAssets = {
  scriptPath: string;
  stylePath: string;
};

export type AgentReportAittyAssetContext = {
  artifactsDir: string;
};

type AittyReportAssetSources = {
  scriptSource: string;
  styleSource: string;
};

// @aitty/snapshot is the canonical renderer for terminal DOM artifacts. Its
// custom element + stylesheet are copied next to the report so generated pages
// stay self-contained without depending on the live browser session runtime.
export function prepareAittyReportAssets(
  context: AgentReportAittyAssetContext,
): AgentReportAittyAssets {
  const sources = resolveAittyReportAssetSources();

  if (!existsSync(sources.scriptSource) || !existsSync(sources.styleSource)) {
    throw new Error(
      "@aitty/snapshot report assets are missing. Reinstall ptywright dependencies before generating reports.",
    );
  }

  const assetDir = join(context.artifactsDir, "assets");
  const scriptPath = join(assetDir, "aitty-web-component.js");
  const stylePath = join(assetDir, "aitty-terminal.css");

  mkdirSync(assetDir, { recursive: true });
  copyFileSync(sources.scriptSource, scriptPath);
  copyFileSync(sources.styleSource, stylePath);

  return { scriptPath, stylePath };
}

function resolveAittyReportAssetSources(): AittyReportAssetSources {
  const sources = tryResolveAittyReportAssetSources(createRequire(import.meta.url));

  if (!sources) {
    throw new Error(
      "@aitty/snapshot report assets are missing. Install @aitty/snapshot before generating reports.",
    );
  }

  return sources;
}

function tryResolveAittyReportAssetSources(
  resolver: NodeJS.Require,
): AittyReportAssetSources | null {
  let scriptSource: string;
  let styleSource: string;

  try {
    scriptSource = resolver.resolve("@aitty/snapshot/web-component.global.js");
    styleSource = resolver.resolve("@aitty/snapshot/style.css");
  } catch {
    return null;
  }

  return { scriptSource, styleSource };
}
