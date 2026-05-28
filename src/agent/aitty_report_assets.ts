import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

export type AgentReportAittyAssets = {
  scriptPath: string;
  scriptType: "classic" | "module";
  stylePath: string;
};

export type AgentReportAittyAssetContext = {
  artifactsDir: string;
  flowPath: string;
  reportPath: string;
};

type AittyReportAssetSources = {
  scriptSource: string;
  scriptType: AgentReportAittyAssets["scriptType"];
  styleSource: string;
};

// @aitty/browser is the canonical renderer for terminal DOM artifacts. Its
// custom element + stylesheet are copied next to the report so generated
// pages stay self-contained.
export function prepareAittyReportAssets(
  context: AgentReportAittyAssetContext,
): AgentReportAittyAssets | null {
  const sources = resolveAittyReportAssetSources(context);

  if (!sources) {
    return null;
  }

  if (!existsSync(sources.scriptSource) || !existsSync(sources.styleSource)) {
    return null;
  }

  const assetDir = join(context.artifactsDir, "assets");
  const scriptPath = join(assetDir, "aitty-web-component.js");
  const stylePath = join(assetDir, "aitty-terminal.css");

  mkdirSync(assetDir, { recursive: true });
  copyFileSync(sources.scriptSource, scriptPath);
  copyFileSync(sources.styleSource, stylePath);

  return { scriptPath, scriptType: sources.scriptType, stylePath };
}

function resolveAittyReportAssetSources(
  context: AgentReportAittyAssetContext,
): AittyReportAssetSources | null {
  for (const resolverBase of resolveAittyReportResolverBases(context)) {
    const sources = tryResolveAittyReportAssetSources(createRequire(resolverBase));
    if (sources) {
      return sources;
    }
  }

  return tryResolveAittyReportAssetSources(createRequire(import.meta.url));
}

function resolveAittyReportResolverBases(context: AgentReportAittyAssetContext): string[] {
  const candidates = [
    findNearestPackageJson(process.cwd()),
    findNearestPackageJson(dirname(resolve(context.flowPath))),
    findNearestPackageJson(dirname(resolve(context.reportPath))),
    findNearestPackageJson(dirname(resolve(context.artifactsDir))),
  ].filter((path): path is string => Boolean(path));

  return Array.from(new Set(candidates));
}

function findNearestPackageJson(startDir: string): string | null {
  let currentDir = resolve(startDir);

  while (true) {
    const packagePath = join(currentDir, "package.json");
    if (existsSync(packagePath)) {
      return packagePath;
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      return null;
    }

    currentDir = parentDir;
  }
}

function tryResolveAittyReportAssetSources(
  resolver: NodeJS.Require,
): AittyReportAssetSources | null {
  let scriptSource: string;
  let scriptType: AgentReportAittyAssets["scriptType"] = "classic";
  let styleSource: string;

  try {
    scriptSource = resolver.resolve("@aitty/browser/web-component.global.js");
  } catch {
    try {
      scriptSource = resolver.resolve("@aitty/browser/web-component.js");
      scriptType = "module";
    } catch {
      return null;
    }
  }

  try {
    styleSource = resolver.resolve("@aitty/browser/style.css");
  } catch {
    return null;
  }

  return { scriptSource, scriptType, styleSource };
}
