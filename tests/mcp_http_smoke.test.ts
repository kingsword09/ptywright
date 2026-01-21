import { expect, test } from "bun:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import { startPtywrightHttpServer } from "../src/mcp/http_server";

function firstTextContent(result: unknown): string {
  if (!result || typeof result !== "object") return "";
  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) return "";

  const first = content[0] as { type?: unknown; text?: unknown } | undefined;
  if (!first || typeof first !== "object") return "";
  if (first.type !== "text") return "";
  return typeof first.text === "string" ? first.text : "";
}

test("MCP server works over Streamable HTTP", async () => {
  const handle = await startPtywrightHttpServer({
    hostname: "127.0.0.1",
    port: 0,
  });

  const client = new Client({
    name: "ptywright-http-smoke-test",
    version: "0.0.0",
  });

  const transport = new StreamableHTTPClientTransport(new URL(handle.url));

  try {
    await client.connect(transport);

    const launch = await client.callTool({
      name: "launch_session",
      arguments: {
        command: process.execPath,
        args: ["-e", "console.log('ready'); setTimeout(() => {}, 1000);"],
      },
    });
    expect(launch.isError ?? false).toBe(false);

    const sessionId = (launch as { structuredContent?: unknown }).structuredContent as
      | { sessionId?: unknown }
      | undefined;
    expect(typeof sessionId?.sessionId).toBe("string");
    const sid = sessionId?.sessionId as string;

    const wait = await client.callTool({
      name: "wait_for_text",
      arguments: {
        sessionId: sid,
        text: "ready",
        timeoutMs: 2000,
      },
    });
    expect(wait.isError ?? false).toBe(false);
    expect(firstTextContent(wait)).toBe("found");
    expect((wait as { structuredContent?: unknown }).structuredContent).toMatchObject({
      found: true,
    });

    const close = await client.callTool({
      name: "close_session",
      arguments: { sessionId: sid },
    });
    expect(close.isError ?? false).toBe(false);
  } finally {
    await client.close();
    await transport.close();
    await handle.close();
  }
});
