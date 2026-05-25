import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { normalizePtyCassette, type PtyCassette } from "./schema";

export function readPtyCassettePath(path: string): PtyCassette {
  return normalizePtyCassette(JSON.parse(readFileSync(path, "utf8")) as unknown);
}

export function writePtyCassettePath(path: string, cassette: PtyCassette): string {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(normalizePtyCassette(cassette), null, 2) + "\n", "utf8");
  return path;
}
