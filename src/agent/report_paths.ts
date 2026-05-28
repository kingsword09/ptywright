import { dirname, relative } from "node:path";

export function relativeHref(fromPath: string, targetPath: string, artifactsDir: string): string {
  if (targetPath.startsWith(artifactsDir)) {
    return relative(dirname(fromPath), targetPath).replaceAll("\\", "/") || ".";
  }
  return targetPath;
}
