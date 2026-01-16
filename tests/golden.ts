import { expect } from "bun:test";

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function assertGoldenJson(path: string, value: unknown): void {
  const update = (process.env.UPDATE_GOLDENS ?? "").toLowerCase();
  const shouldUpdate = update === "1" || update === "true";

  const text = `${JSON.stringify(value, null, 2)}\n`;

  if (shouldUpdate) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text, "utf8");
  }

  const expected = readFileSync(path, "utf8");
  expect(text).toBe(expected);
}
