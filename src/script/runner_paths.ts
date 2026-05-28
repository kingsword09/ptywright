import { isAbsolute, resolve } from "node:path";

import type { Script } from "./schema";

export type ScriptPathResolvers = {
  resolveGoldenPath(path: string): string;
  resolveArtifactPath(path: string): string;
};

export function resolveArtifactsDir(script: Script, scriptName: string, override?: string): string {
  if (override?.trim()) return resolve(override.trim());
  if (script.artifactsDir?.trim()) return resolve(script.artifactsDir.trim());
  return resolve(".tmp", "runs", scriptName);
}

export function createScriptPathResolvers(artifactsDir: string): ScriptPathResolvers {
  return {
    resolveGoldenPath: (path: string) => (isAbsolute(path) ? path : resolve(process.cwd(), path)),
    resolveArtifactPath: (path: string) => (isAbsolute(path) ? path : resolve(artifactsDir, path)),
  };
}
