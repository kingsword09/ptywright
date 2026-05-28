import { dirname, isAbsolute, relative, resolve } from "node:path";

export function samePath(left: string, right: string): boolean {
  return resolve(process.cwd(), left) === resolve(process.cwd(), right);
}

export function portablePath(path: string, rootDir: string): string {
  const rel = relative(rootDir, path);
  if (rel && !rel.startsWith("..") && !isAbsolute(rel)) {
    return rel;
  }
  return path;
}

export function portableCliPath(path: string): string {
  const abs = resolve(process.cwd(), path);
  return portablePath(abs, process.cwd());
}

export function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

export function relativeHref(fromFile: string, toFile: string): string {
  const rel = relative(dirname(fromFile), toFile);
  const normalized = normalizePath(rel);
  return normalized.startsWith(".") ? normalized : `./${normalized}`;
}
