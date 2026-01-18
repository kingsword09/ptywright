import { expect, test } from "bun:test";

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

function firstTextContent(result: unknown): string {
  if (!result || typeof result !== "object") return "";
  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) return "";

  const first = content[0] as { type?: unknown; text?: unknown } | undefined;
  if (!first || typeof first !== "object") return "";
  if (first.type !== "text") return "";
  return typeof first.text === "string" ? first.text : "";
}

test("MCP server smoke test", async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["src/index.ts"],
    cwd: process.cwd(),
    stderr: "pipe",
  });

  const client = new Client({
    name: "ptywright-smoke",
    version: "0.0.0",
  });

  await client.connect(transport);

  const list = await client.listTools();
  expect(list.tools.some((t) => t.name === "ptywright_launch_session")).toBe(true);
  expect(list.tools.some((t) => t.name === "ptywright_snapshot_ansi")).toBe(true);
  expect(list.tools.some((t) => t.name === "ptywright_snapshot_view_ansi")).toBe(true);
  expect(list.tools.some((t) => t.name === "ptywright_send_mouse")).toBe(true);
  expect(list.tools.some((t) => t.name === "ptywright_snapshot_cast")).toBe(true);
  expect(list.tools.some((t) => t.name === "ptywright_mark")).toBe(true);
  expect(list.tools.some((t) => t.name === "ptywright_run_script")).toBe(true);
  expect(list.tools.some((t) => t.name === "ptywright_run_all_scripts")).toBe(true);
  expect(list.tools.some((t) => t.name === "ptywright_start_script_recording")).toBe(true);
  expect(list.tools.some((t) => t.name === "ptywright_stop_script_recording")).toBe(true);

  const scriptRun = await client.callTool({
    name: "ptywright_run_script",
    arguments: {
      scriptPath: "scripts/m6_json_custom_demo.json",
      stepsPath: "scripts/m6_json_custom_steps.ts",
      artifactsDir: ".tmp/test_scripts/mcp_run_script",
    },
  });
  expect(scriptRun.isError ?? false).toBe(false);
  const scriptArtifactsDir = (scriptRun.structuredContent as { artifactsDir?: string } | undefined)
    ?.artifactsDir;
  expect(typeof scriptArtifactsDir).toBe("string");
  const maskedPath = join(resolve(scriptArtifactsDir ?? ""), "masked.txt");
  expect(existsSync(maskedPath)).toBe(true);
  expect(readFileSync(maskedPath, "utf8").trimEnd()).toBe("TOKEN: <id>\nDONE");

  const launched = await client.callTool({
    name: "ptywright_launch_session",
    arguments: {
      command: process.execPath,
      args: ["tests/fixtures/ansi_demo.ts"],
      cols: 40,
      rows: 8,
    },
  });

  expect(launched.isError ?? false).toBe(false);
  const sessionId = (launched.structuredContent as { sessionId?: string } | undefined)?.sessionId;
  expect(typeof sessionId).toBe("string");

  const waited = await client.callTool({
    name: "ptywright_wait_for_text",
    arguments: {
      sessionId,
      text: "DONE",
      timeoutMs: 5_000,
      intervalMs: 50,
    },
  });

  const found = (waited.structuredContent as { found?: boolean } | undefined)?.found;
  expect(found).toBe(true);

  await client.callTool({
    name: "ptywright_mark",
    arguments: { sessionId, label: "smoke" },
  });

  const snap = await client.callTool({
    name: "ptywright_snapshot_view",
    arguments: { sessionId, trimRight: true },
  });
  const viewText = firstTextContent(snap);
  expect(viewText).toContain("Hello world");
  expect(viewText).toContain("DONE");

  const ansiSnap = await client.callTool({
    name: "ptywright_snapshot_ansi",
    arguments: { sessionId, trimRight: true, trimBottom: true },
  });
  const ansiText = firstTextContent(ansiSnap);
  expect(ansiText).toContain("Hello world");

  const ansiViewSnap = await client.callTool({
    name: "ptywright_snapshot_view_ansi",
    arguments: { sessionId, trimRight: true },
  });
  const ansiViewText = firstTextContent(ansiViewSnap);
  expect(ansiViewText).toContain("Hello world");

  const castSnap = await client.callTool({
    name: "ptywright_snapshot_cast",
    arguments: { sessionId },
  });
  const castText = firstTextContent(castSnap);
  expect(castText).toContain("Hello world");
  expect(castText).toContain("smoke");

  await client.callTool({
    name: "ptywright_close_session",
    arguments: { sessionId },
  });

  await client.close();
  await transport.close();
});
