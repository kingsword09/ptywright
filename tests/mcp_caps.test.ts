import { expect, test } from "bun:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

test("MCP server capability gating defaults to core-only", async () => {
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
  expect(list.tools.some((t) => t.name === "launch_session")).toBe(true);
  expect(list.tools.some((t) => t.name === "snapshot_text")).toBe(true);
  expect(list.tools.some((t) => t.name === "snapshot_view")).toBe(true);

  // debug/script/recording should be disabled by default
  expect(list.tools.some((t) => t.name === "snapshot_ansi")).toBe(false);
  expect(list.tools.some((t) => t.name === "run_script")).toBe(false);
  expect(list.tools.some((t) => t.name === "start_script_recording")).toBe(false);

  await client.close();
  await transport.close();
});
