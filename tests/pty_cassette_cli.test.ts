import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "bun:test";

import { cmdPty } from "../src/pty-cassette/cli";
import { readPtyCassettePath } from "../src/pty-cassette";

test("pty cassette CLI records, validates, inspects, and replays a command", async () => {
  const dir = join(".tmp", "tests", "pty-cassette-cli");
  const outPath = join(dir, "ansi.pty.json");
  rmSync(dir, { recursive: true, force: true });

  const recordCode = await cmdPty([
    "record",
    "--out",
    outPath,
    "--cols",
    "40",
    "--rows",
    "8",
    "--",
    process.execPath,
    "tests/fixtures/ansi_demo.ts",
  ]);

  expect(recordCode).toBe(0);
  expect(existsSync(outPath)).toBe(true);

  const cassette = readPtyCassettePath(outPath);
  expect(cassette.terminal).toMatchObject({ cols: 40, rows: 8, term: "xterm-256color" });
  expect(cassette.command?.file).toBe(process.execPath);
  expect(cassette.events.some((event) => event.type === "output")).toBe(true);
  expect(cassette.events.some((event) => event.type === "exit")).toBe(true);

  expect(await cmdPty(["validate", outPath])).toBe(0);
  expect(await cmdPty(["inspect", outPath])).toBe(0);
  expect(await cmdPty(["replay", outPath])).toBe(0);
});
