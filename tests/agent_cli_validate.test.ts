import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "bun:test";

import { main } from "../src/cli";

function currentExitCode(): string | number | null | undefined {
  return process.exitCode;
}

test("agent validate CLI returns success for a valid flow spec", async () => {
  const dir = join(".tmp", "tests", "agent-cli-validate");
  const path = join(dir, "flow.json");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path,
    JSON.stringify(
      {
        name: "cli_validate_fixture",
        launch: {
          mode: "url",
          url: "http://127.0.0.1:3000/",
        },
        steps: [{ type: "snapshot", name: "ready" }],
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  process.exitCode = undefined;
  try {
    await main(["agent", "validate", path]);
    expect(currentExitCode()).toBe(0);
  } finally {
    process.exitCode = 0;
  }
});

test("agent validate CLI accepts JSON output mode", async () => {
  const dir = join(".tmp", "tests", "agent-cli-validate-json");
  const path = join(dir, "flow.json");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path,
    JSON.stringify(
      {
        name: "cli_validate_json_fixture",
        launch: {
          mode: "url",
          url: "http://127.0.0.1:3000/",
        },
        steps: [{ type: "snapshot", name: "ready" }],
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  const logs: string[] = [];
  const originalLog = console.log;

  process.exitCode = undefined;
  try {
    console.log = (...args: unknown[]) => {
      logs.push(args.map((arg) => String(arg)).join(" "));
    };
    await main(["agent", "validate", path, "--json"]);
    expect(currentExitCode()).toBe(0);
  } finally {
    console.log = originalLog;
    process.exitCode = 0;
  }

  const parsed = JSON.parse(logs.join("\n")) as {
    ok?: boolean;
    totalCount?: number;
    failureCount?: number;
    entries?: Array<{ kind?: string; ok?: boolean }>;
  };
  expect(parsed.ok).toBe(true);
  expect(parsed.totalCount).toBe(1);
  expect(parsed.failureCount).toBe(0);
  expect(parsed.entries?.[0]).toMatchObject({ kind: "flow", ok: true });
});

test("agent validate CLI returns failure for malformed artifacts", async () => {
  const dir = join(".tmp", "tests", "agent-cli-validate-bad");
  const path = join(dir, "bad.agent-run.json");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path,
    JSON.stringify({ version: 1, cassettePath: "missing.cassette.json" }),
    "utf8",
  );

  process.exitCode = undefined;
  try {
    await main(["agent", "validate", path]);
    expect(currentExitCode()).toBe(1);
  } finally {
    process.exitCode = 0;
  }
});
