import { expect, test } from "bun:test";

import { listTestFiles, type SpawnSyncLike } from "../scripts/test_files";

test("test file discovery falls back when ripgrep is unavailable", () => {
  const missingRg: SpawnSyncLike = () => {
    throw Object.assign(new Error('Executable not found in $PATH: "rg"'), {
      code: "ENOENT",
    });
  };

  const files = listTestFiles({ spawnSync: missingRg });

  expect(files).toContain("tests/pty_cassette.test.ts");
  expect(files).toContain("tests/test_all_files.test.ts");
  expect(files.every((file) => file.endsWith(".test.ts"))).toBe(true);
});

test("test file discovery prefers ripgrep output when available", () => {
  const fakeRg: SpawnSyncLike = () => ({
    success: true,
    stdout: new TextEncoder().encode("tests/z.test.ts\ntests/a.test.ts\n"),
  });

  expect(listTestFiles({ spawnSync: fakeRg })).toEqual(["tests/a.test.ts", "tests/z.test.ts"]);
});
