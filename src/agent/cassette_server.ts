import { createServer, type Server } from "node:http";
import type { Socket } from "node:net";

import { escapeHtml } from "./html_escape";
import type { AgentCassette } from "./cassette";

export type AgentCassetteServer = {
  url: string;
  close: () => Promise<void>;
};

export async function startAgentCassetteServer(
  cassette: AgentCassette,
): Promise<AgentCassetteServer> {
  const sockets = new Set<Socket>();
  const server = createServer((request, response) => {
    if (request.url === "/health") {
      response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      response.end("ok");
      return;
    }

    response.writeHead(200, {
      "cache-control": "no-store",
      "content-type": "text/html; charset=utf-8",
    });
    response.end(renderCassetteHtml(cassette));
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => {
      sockets.delete(socket);
    });
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      rejectListen(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolveListen();
    };

    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(0, "127.0.0.1");
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    await closeServer(server, sockets);
    throw new Error("failed to bind cassette replay server");
  }

  return {
    url: `http://127.0.0.1:${address.port}/`,
    close: () => closeServer(server, sockets),
  };
}

function renderCassetteHtml(cassette: AgentCassette): string {
  const framesJson = JSON.stringify(cassette.frames).replace(/</g, "\\u003c");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(cassette.name)} cassette replay</title>
    <style>
      :root {
        color-scheme: dark;
        background: #101418;
        color: #eef3f8;
        font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
      }
      body {
        margin: 0;
        background: #101418;
      }
      [data-terminal-root] {
        min-height: 100vh;
        outline: none;
      }
      .term-grid {
        white-space: pre;
      }
      .term-row {
        min-height: 1em;
      }
    </style>
  </head>
  <body>
    <div data-terminal-root tabindex="0"></div>
    <script>
      const frames = ${framesJson};
      const root = document.querySelector("[data-terminal-root]");
      let phase = 0;

      function queryViewport() {
        const params = new URLSearchParams(window.location.search);
        const width = Number.parseInt(params.get("viewportWidth") || "", 10);
        const height = Number.parseInt(params.get("viewportHeight") || "", 10);
        const name = params.get("viewportName") || "";
        return {
          height: Number.isFinite(height) && height > 0 ? height : window.innerHeight,
          name,
          width: Number.isFinite(width) && width > 0 ? width : window.innerWidth,
        };
      }

      function viewportScore(frame) {
        const viewport = frame.viewport || {};
        const target = queryViewport();
        const namePenalty = target.name && viewport.name !== target.name ? 100000 : 0;
        return namePenalty +
          Math.abs((viewport.width || target.width) - target.width) +
          Math.abs((viewport.height || target.height) - target.height);
      }

      function chooseFrame() {
        const eligible = frames
          .filter((frame) => Number(frame.phase || 0) <= phase)
          .sort((a, b) => {
            const phaseDelta = Number(b.phase || 0) - Number(a.phase || 0);
            if (phaseDelta !== 0) return phaseDelta;
            return viewportScore(a) - viewportScore(b);
          });
        return eligible[0] || frames.slice().sort((a, b) => viewportScore(a) - viewportScore(b))[0];
      }

      function renderText(text) {
        const grid = document.createElement("div");
        grid.className = "term-grid";
        for (const line of String(text || "").split("\\n")) {
          const row = document.createElement("div");
          row.className = "term-row";
          const span = document.createElement("span");
          span.textContent = line;
          row.appendChild(span);
          grid.appendChild(row);
        }
        root.replaceChildren(grid);
      }

      function render() {
        const frame = chooseFrame();
        if (!frame) {
          renderText("");
          return;
        }
        if (frame.dom) {
          root.innerHTML = frame.dom;
        } else {
          renderText(frame.terminalText || "");
        }
        root.dataset.replayPhase = String(phase);
      }

      window.__ptywrightReplaySetPhase = (nextPhase) => {
        const parsed = Number(nextPhase);
        phase = Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : phase;
        render();
      };

      window.addEventListener("resize", render);
      root.addEventListener("focus", render);
      root.focus();
      render();
    </script>
  </body>
</html>`;
}

async function closeServer(server: Server, sockets: Set<Socket>): Promise<void> {
  const serverWithConnectionClosers = server as Server & {
    closeIdleConnections?: () => void;
    closeAllConnections?: () => void;
  };

  serverWithConnectionClosers.closeIdleConnections?.();

  await new Promise<void>((resolveClose, rejectClose) => {
    const forceCloseTimer = setTimeout(() => {
      serverWithConnectionClosers.closeAllConnections?.();
      for (const socket of sockets) {
        socket.destroy();
      }
    }, 500);

    const finishTimer = setTimeout(() => {
      resolveClose();
    }, 2_000);

    server.close((error) => {
      clearTimeout(forceCloseTimer);
      clearTimeout(finishTimer);
      if (error) rejectClose(error);
      else resolveClose();
    });
  });
}
