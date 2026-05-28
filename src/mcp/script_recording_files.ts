import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export function writeOrThrow(path: string, text: string, overwrite: boolean): void {
  const abs = resolvePathLike(path, true);
  if (!overwrite && existsSync(abs)) {
    throw new Error(`refusing to overwrite: ${path}`);
  }
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, text, "utf8");
}

export function resolvePathLike(path: string, absolute: boolean): string {
  if (!absolute) return toPosixPath(path);
  return resolve(process.cwd(), path);
}

export function sanitizeLabel(label: string): string {
  return label.replace(/[^a-z0-9._-]+/gi, "_").replace(/^_+|_+$/g, "") || "checkpoint";
}

export function toPosixPath(path: string): string {
  return path.replace(/\\/g, "/");
}

export function joinPosix(a: string, b: string): string {
  const left = a.replace(/\\/g, "/").replace(/\/+$/g, "");
  const right = b.replace(/\\/g, "/").replace(/^\/+/g, "");
  return `${left}/${right}`;
}
