import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { startPtywrightHttpServer } from "../mcp/http_server";
import { createPtywrightServer, type PtywrightCapability } from "../mcp/server";
import { isHelp, usage } from "./common";

function parseCaps(value: string): PtywrightCapability[] {
  const parts = value
    .split(/[\s,]+/g)
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);

  const out: PtywrightCapability[] = [];
  for (const p of parts) {
    if (p === "all") out.push("all");
    else if (p === "core") out.push("core");
    else if (p === "debug") out.push("debug");
    else if (p === "script" || p === "scripts" || p === "runner" || p === "run") out.push("script");
    else if (p === "recording" || p === "record" || p === "rec") out.push("recording");
    else throw new Error(`unknown capability: ${p}`);
  }
  return out;
}

export async function cmdMcp(argv: string[]): Promise<void> {
  let capabilities: PtywrightCapability[] | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (isHelp(arg)) {
      // eslint-disable-next-line no-console
      console.log(usage());
      return;
    }

    if (arg === "--caps" && next) {
      capabilities = parseCaps(next);
      i += 1;
      continue;
    }

    throw new Error(`unknown arg: ${arg ?? ""}`);
  }

  const { server, sessions } = createPtywrightServer({ capabilities });
  const transport = new StdioServerTransport();
  await server.connect(transport);

  function shutdown(): void {
    sessions.closeAll();
    void server.close();
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

export async function cmdMcpHttp(argv: string[]): Promise<void> {
  let capabilities: PtywrightCapability[] | undefined;
  let hostname: string | undefined;
  let port: number | undefined;
  let allowedOrigins: string[] | undefined;
  let cors = true;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (isHelp(arg)) {
      // eslint-disable-next-line no-console
      console.log(usage());
      return;
    }

    if (arg === "--caps" && next) {
      capabilities = parseCaps(next);
      i += 1;
      continue;
    }

    if ((arg === "--host" || arg === "--hostname") && next) {
      hostname = next;
      i += 1;
      continue;
    }

    if (arg === "--port" && next) {
      const value = Number.parseInt(next, 10);
      if (!Number.isFinite(value) || value < 0) {
        throw new Error(`invalid --port: ${next}`);
      }
      port = value;
      i += 1;
      continue;
    }

    if (arg === "--allowed-origins" && next) {
      allowedOrigins = next
        .split(/[\s,]+/g)
        .map((v) => v.trim())
        .filter(Boolean);
      i += 1;
      continue;
    }

    if (arg === "--no-cors") {
      cors = false;
      continue;
    }

    throw new Error(`unknown arg: ${arg ?? ""}`);
  }

  const handle = await startPtywrightHttpServer({
    hostname,
    port,
    capabilities,
    allowedOrigins,
    cors,
  });

  // eslint-disable-next-line no-console
  console.log(`listening ${handle.url}`);
  // eslint-disable-next-line no-console
  console.log(`health http://${handle.hostname}:${handle.port}/health`);

  function shutdown(): void {
    void handle.close();
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
