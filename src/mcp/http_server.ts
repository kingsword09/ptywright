import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import type { PtywrightCapability } from "./server";
import { createPtywrightServer } from "./server";

export type PtywrightHttpServerOptions = {
  hostname?: string;
  port?: number;
  capabilities?: PtywrightCapability[];

  /**
   * If the request includes an Origin header, it must match one of these values.
   * Use ["*"] to allow any Origin (NOT recommended).
   */
  allowedOrigins?: string[];

  /**
   * Add CORS headers for browser-based clients.
   * If false, this server is intended for non-browser clients only.
   */
  cors?: boolean;
};

export type PtywrightHttpServerHandle = {
  url: string;
  hostname: string;
  port: number;
  close: () => Promise<void>;
};

function parseAllowedOrigins(value: string | undefined): string[] | undefined {
  if (!value?.trim()) return undefined;
  return value
    .split(/[\s,]+/g)
    .map((v) => v.trim())
    .filter(Boolean);
}

function isOriginAllowed(origin: string, allowed: string[]): boolean {
  if (allowed.includes("*")) return true;
  return allowed.includes(origin);
}

function withCorsHeaders(
  init: ResponseInit,
  origin: string | null,
  allowed: string[],
): ResponseInit {
  if (!origin) return init;
  if (!isOriginAllowed(origin, allowed)) return init;

  const headers = new Headers(init.headers);
  headers.set("access-control-allow-origin", origin);
  headers.set("vary", "origin");
  headers.set("access-control-allow-methods", "GET,POST,DELETE,OPTIONS");
  headers.set(
    "access-control-allow-headers",
    "content-type,mcp-session-id,last-event-id,mcp-protocol-version",
  );
  headers.set("access-control-expose-headers", "mcp-session-id,mcp-protocol-version");

  return { ...init, headers };
}

export async function startPtywrightHttpServer(
  options?: PtywrightHttpServerOptions,
): Promise<PtywrightHttpServerHandle> {
  const hostname = options?.hostname?.trim() ? options.hostname.trim() : "127.0.0.1";
  const desiredPort = options?.port ?? 3000;
  const cors = options?.cors ?? true;

  const { server, sessions } = createPtywrightServer({
    capabilities: options?.capabilities,
  });

  const transport = new WebStandardStreamableHTTPServerTransport();
  await server.connect(transport);

  let allowedOrigins: string[] =
    options?.allowedOrigins ??
    parseAllowedOrigins(process.env.PTYWRIGHT_HTTP_ALLOWED_ORIGINS) ??
    [];

  const srv = Bun.serve({
    hostname,
    port: desiredPort,
    fetch: async (req: Request) => {
      const url = new URL(req.url);
      const origin = req.headers.get("origin");

      if (url.pathname === "/health") {
        const init = withCorsHeaders(
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
          cors ? origin : null,
          allowedOrigins,
        );
        return new Response(JSON.stringify({ status: "ok" }), init);
      }

      if (url.pathname !== "/mcp") {
        const init = withCorsHeaders(
          {
            status: 404,
            headers: { "content-type": "text/plain; charset=utf-8" },
          },
          cors ? origin : null,
          allowedOrigins,
        );
        return new Response("not found", init);
      }

      // Per MCP Streamable HTTP security guidance: validate Origin (when present).
      if (origin && !isOriginAllowed(origin, allowedOrigins)) {
        return new Response("forbidden", {
          status: 403,
          headers: cors
            ? {
                "content-type": "text/plain; charset=utf-8",
                "access-control-allow-origin": origin,
                vary: "origin",
              }
            : { "content-type": "text/plain; charset=utf-8" },
        });
      }

      if (req.method === "OPTIONS") {
        return new Response(null, withCorsHeaders({ status: 204 }, origin, allowedOrigins));
      }

      const res = await transport.handleRequest(req);

      if (!cors) return res;

      const init = withCorsHeaders(
        {
          status: res.status,
          statusText: res.statusText,
          headers: res.headers,
        },
        origin,
        allowedOrigins,
      );
      return new Response(res.body, init);
    },
  });

  const port = srv.port;
  if (port === undefined) {
    await srv.stop();
    sessions.closeAll();
    await server.close();
    throw new Error("failed to bind HTTP server port");
  }

  if (allowedOrigins.length === 0) {
    allowedOrigins = [`http://localhost:${port}`, `http://127.0.0.1:${port}`];
  }

  const url = `http://${hostname}:${port}/mcp`;

  return {
    url,
    hostname,
    port,
    close: async () => {
      await srv.stop();
      sessions.closeAll();
      await server.close();
    },
  };
}
