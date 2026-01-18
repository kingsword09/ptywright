import { expect, test } from "bun:test";

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { runScriptFile } from "../src/script/runner";

test("MCP script recording exports a runnable JSON script + goldens", async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["src/index.ts"],
    cwd: process.cwd(),
    stderr: "pipe",
  });

  const client = new Client({
    name: "ptywright-recording-test",
    version: "0.0.0",
  });

  await client.connect(transport);

  const outPath = ".tmp/test_scripts/m9_script_recording/recorded.json";
  const goldenDir = ".tmp/test_scripts/m9_script_recording/goldens";

  const started = await client.callTool({
    name: "ptywright_start_script_recording",
    arguments: {
      name: "m9_script_recording",
      outPath,
      goldenDir,
      overwrite: true,
      mask: [
        {
          regex: "TOKEN: [0-9a-f-]+",
          flags: "i",
          replacement: "TOKEN: <id>",
        },
      ],
    },
  });
  expect(started.isError ?? false).toBe(false);
  const recordingId = (started.structuredContent as { recordingId?: string } | undefined)
    ?.recordingId;
  expect(typeof recordingId).toBe("string");

  const launched = await client.callTool({
    name: "ptywright_launch_session",
    arguments: {
      command: "bun",
      args: ["run", "tests/fixtures/random_token_demo.ts"],
      cwd: ".",
      cols: 60,
      rows: 8,
      name: "xterm-256color",
    },
  });
  expect(launched.isError ?? false).toBe(false);
  const sessionId = (launched.structuredContent as { sessionId?: string } | undefined)?.sessionId;
  expect(typeof sessionId).toBe("string");

  await client.callTool({
    name: "ptywright_wait_for_text",
    arguments: { sessionId, scope: "visible", text: "DONE", timeoutMs: 5_000, intervalMs: 50 },
  });

  await client.callTool({
    name: "ptywright_mark",
    arguments: { sessionId, label: "done" },
  });

  const stopped = await client.callTool({
    name: "ptywright_stop_script_recording",
    arguments: { recordingId, writeFiles: true },
  });
  expect(stopped.isError ?? false).toBe(false);

  const scriptPath = (stopped.structuredContent as { scriptPath?: string } | undefined)?.scriptPath;
  expect(scriptPath).toBe(outPath);

  expect(existsSync(resolve(outPath))).toBe(true);
  expect(existsSync(resolve(`${goldenDir}/done.txt`))).toBe(true);

  const parsed = JSON.parse(readFileSync(resolve(outPath), "utf8")) as { steps?: unknown[] };
  expect(Array.isArray(parsed.steps)).toBe(true);
  expect((parsed.steps ?? []).some((s) => (s as { type?: string }).type === "expectGolden")).toBe(
    true,
  );

  const result = await runScriptFile(resolve(outPath), {
    artifactsDir: resolve(".tmp/test_scripts/m9_script_recording/run"),
  });
  expect(result.ok).toBe(true);
});
