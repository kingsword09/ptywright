import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const files = listTestFiles();

for (const file of files) {
  const result = Bun.spawnSync({
    cmd: ["bun", "test", file],
    stdout: "inherit",
    stderr: "inherit",
  });

  if (!result.success) {
    process.exit(result.exitCode);
  }
}

function listTestFiles(): string[] {
  const rg = Bun.spawnSync({
    cmd: ["rg", "--files", "tests", "-g", "*.test.ts"],
    stdout: "pipe",
    stderr: "pipe",
  });

  if (rg.success) {
    return new TextDecoder()
      .decode(rg.stdout)
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  }

  return walk("tests")
    .filter((file) => file.endsWith(".test.ts"))
    .sort((a, b) => a.localeCompare(b));
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      out.push(...walk(path));
      continue;
    }
    out.push(path);
  }
  return out;
}
