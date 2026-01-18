import { expect, test } from "bun:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

test("MCP server tools default to all", async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["src/index.ts"],
    cwd: process.cwd(),
    stderr: "pipe",
  });

  const client = new Client({
    name: "ptywright-caps-test",
    version: "0.0.0",
  });

  await client.connect(transport);

  const list = await client.listTools();
  expect(list.tools.some((t) => t.name === "ptywright_launch_session")).toBe(true);
  expect(list.tools.some((t) => t.name === "ptywright_select_session")).toBe(true);
  expect(list.tools.some((t) => t.name === "ptywright_snapshot_text")).toBe(true);
  expect(list.tools.some((t) => t.name === "ptywright_snapshot_view")).toBe(true);

  expect(list.tools.some((t) => t.name === "ptywright_snapshot_ansi")).toBe(true);
  expect(list.tools.some((t) => t.name === "ptywright_run_script")).toBe(true);
  expect(list.tools.some((t) => t.name === "ptywright_run_all_scripts")).toBe(true);
  expect(list.tools.some((t) => t.name === "ptywright_start_script_recording")).toBe(true);
  expect(list.tools.some((t) => t.name === "ptywright_stop_script_recording")).toBe(true);
  expect(list.tools.some((t) => t.name === "ptywright_mark")).toBe(true);

  await client.close();
  await transport.close();
});

test("PTYWRIGHT_CAPS=core restricts to core tools", async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["src/index.ts"],
    cwd: process.cwd(),
    env: {
      PTYWRIGHT_CAPS: "core",
    },
    stderr: "pipe",
  });

  const client = new Client({
    name: "ptywright-caps-core-test",
    version: "0.0.0",
  });

  await client.connect(transport);

  const list = await client.listTools();
  expect(list.tools.some((t) => t.name === "ptywright_launch_session")).toBe(true);
  expect(list.tools.some((t) => t.name === "ptywright_select_session")).toBe(true);
  expect(list.tools.some((t) => t.name === "ptywright_snapshot_text")).toBe(true);
  expect(list.tools.some((t) => t.name === "ptywright_snapshot_view")).toBe(true);

  // debug/script/recording should be disabled when restricted to core
  expect(list.tools.some((t) => t.name === "ptywright_snapshot_ansi")).toBe(false);
  expect(list.tools.some((t) => t.name === "ptywright_run_script")).toBe(false);
  expect(list.tools.some((t) => t.name === "ptywright_start_script_recording")).toBe(false);

  await client.close();
  await transport.close();
});
