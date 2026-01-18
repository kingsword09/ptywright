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

test("ptywright_select_session enables omitting sessionId", async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["src/index.ts"],
    cwd: process.cwd(),
    stderr: "pipe",
  });

  const client = new Client({
    name: "ptywright-select-session-test",
    version: "0.0.0",
  });

  await client.connect(transport);

  const launched1 = await client.callTool({
    name: "ptywright_launch_session",
    arguments: {
      command: process.execPath,
      args: ["tests/fixtures/ansi_demo.ts"],
      cols: 40,
      rows: 8,
    },
  });
  expect(launched1.isError ?? false).toBe(false);
  const sessionId1 = (launched1.structuredContent as { sessionId?: string } | undefined)?.sessionId;
  expect(typeof sessionId1).toBe("string");

  await client.callTool({
    name: "ptywright_wait_for_text",
    arguments: { text: "DONE", timeoutMs: 5_000, intervalMs: 50 },
  });

  const snap1 = await client.callTool({
    name: "ptywright_snapshot_text",
    arguments: { trimRight: true, trimBottom: true },
  });
  expect(firstTextContent(snap1)).toContain("Hello world");

  const launched2 = await client.callTool({
    name: "ptywright_launch_session",
    arguments: {
      command: "bun",
      args: ["run", "tests/fixtures/random_token_demo.ts"],
      cols: 60,
      rows: 8,
    },
  });
  expect(launched2.isError ?? false).toBe(false);
  const sessionId2 = (launched2.structuredContent as { sessionId?: string } | undefined)?.sessionId;
  expect(typeof sessionId2).toBe("string");

  await client.callTool({
    name: "ptywright_wait_for_text",
    arguments: { text: "TOKEN:", timeoutMs: 5_000, intervalMs: 50 },
  });

  const snap2 = await client.callTool({
    name: "ptywright_snapshot_text",
    arguments: {
      trimRight: true,
      trimBottom: true,
      mask: [{ regex: "TOKEN: [0-9a-f-]+", flags: "i", replacement: "TOKEN: <id>" }],
    },
  });
  expect(firstTextContent(snap2)).toContain("TOKEN: <id>");
  expect(firstTextContent(snap2)).not.toContain("Hello world");

  await client.callTool({
    name: "ptywright_select_session",
    arguments: { sessionId: sessionId1 },
  });

  const snap1Again = await client.callTool({
    name: "ptywright_snapshot_text",
    arguments: { trimRight: true, trimBottom: true },
  });
  expect(firstTextContent(snap1Again)).toContain("Hello world");

  // ptywright_close_session can omit sessionId (uses selected session)
  await client.callTool({
    name: "ptywright_close_session",
    arguments: {},
  });

  await client.callTool({
    name: "ptywright_close_session",
    arguments: { sessionId: sessionId2 },
  });

  await client.close();
  await transport.close();
});
