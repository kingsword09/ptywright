import { expect, test } from "bun:test";

import { existsSync } from "node:fs";

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

test("ptywright_run_all_scripts supports output controls", async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["src/index.ts"],
    cwd: process.cwd(),
    stderr: "pipe",
  });

  const client = new Client({
    name: "ptywright-run-all-scripts-test",
    version: "0.0.0",
  });

  await client.connect(transport);

  const result = await client.callTool({
    name: "ptywright_run_all_scripts",
    arguments: {
      dir: "tests/fixtures/run_all_scripts",
      artifactsRoot: ".tmp/test_scripts/mcp_run_all_scripts",
      stepsPath: "tests/fixtures/run_all_scripts/custom_steps.ts",
      includeEntries: "all",
      maxEntries: 1,
    },
  });

  expect(result.isError ?? false).toBe(false);
  expect(firstTextContent(result)).toContain("count=");

  const structured = result.structuredContent as
    | {
        ok?: boolean;
        totalCount?: number;
        entries?: unknown[];
        truncatedCount?: number;
        reportPath?: string;
        summaryPath?: string;
      }
    | undefined;

  expect(structured?.ok).toBe(true);
  expect(structured?.totalCount).toBeGreaterThan(1);
  expect((structured?.entries ?? []).length).toBe(1);
  expect(structured?.truncatedCount).toBeGreaterThan(0);

  expect(typeof structured?.reportPath).toBe("string");
  expect(typeof structured?.summaryPath).toBe("string");
  expect(existsSync(structured?.reportPath ?? "")).toBe(true);
  expect(existsSync(structured?.summaryPath ?? "")).toBe(true);

  await client.close();
  await transport.close();
});
