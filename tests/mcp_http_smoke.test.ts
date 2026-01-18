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

    const result = await client.callTool({
      name: "ptywright_list_sessions",
      arguments: {},
    });

    expect(result.isError ?? false).toBe(false);
    expect(typeof firstTextContent(result)).toBe("string");
  } finally {
    await client.close();
    await transport.close();
    await handle.close();
  }
});
