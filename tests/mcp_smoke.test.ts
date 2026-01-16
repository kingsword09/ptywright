import { expect, test } from "bun:test";

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
  expect(list.tools.some((t) => t.name === "launch_session")).toBe(true);
  expect(list.tools.some((t) => t.name === "snapshot_ansi")).toBe(true);
  expect(list.tools.some((t) => t.name === "snapshot_view_ansi")).toBe(true);
  expect(list.tools.some((t) => t.name === "send_mouse")).toBe(true);
  expect(list.tools.some((t) => t.name === "snapshot_cast")).toBe(true);
  expect(list.tools.some((t) => t.name === "mark")).toBe(true);

  const launched = await client.callTool({
    name: "launch_session",
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
    name: "wait_for_text",
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
    name: "mark",
    arguments: { sessionId, label: "smoke" },
  });

  const snap = await client.callTool({
    name: "snapshot_view",
    arguments: { sessionId, trimRight: true },
  });
  const viewText = firstTextContent(snap);
  expect(viewText).toContain("Hello world");
  expect(viewText).toContain("DONE");

  const ansiSnap = await client.callTool({
    name: "snapshot_ansi",
    arguments: { sessionId, trimRight: true, trimBottom: true },
  });
  const ansiText = firstTextContent(ansiSnap);
  expect(ansiText).toContain("Hello world");

  const ansiViewSnap = await client.callTool({
    name: "snapshot_view_ansi",
    arguments: { sessionId, trimRight: true },
  });
  const ansiViewText = firstTextContent(ansiViewSnap);
  expect(ansiViewText).toContain("Hello world");

  const castSnap = await client.callTool({
    name: "snapshot_cast",
    arguments: { sessionId },
  });
  const castText = firstTextContent(castSnap);
  expect(castText).toContain("Hello world");
  expect(castText).toContain("smoke");

  await client.callTool({
    name: "close_session",
    arguments: { sessionId },
  });

  await client.close();
  await transport.close();
});
