import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createTerminalDriverServer } from "./mcp/server";

const { server, sessions } = createTerminalDriverServer();

const transport = new StdioServerTransport();
await server.connect(transport);

function shutdown(): void {
  sessions.closeAll();
  void server.close();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
