import { createServer } from "node:http";

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
  response.end(renderHtml());
});

server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  if (!address || typeof address === "string") {
    console.error("failed to bind browser terminal fixture");
    process.exit(1);
  }
  console.log(`http://127.0.0.1:${address.port}/`);
});

process.on("SIGTERM", closeAndExit);
process.on("SIGINT", closeAndExit);

function closeAndExit(): void {
  server.close(() => process.exit(0));
}

function renderHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Deterministic Browser Terminal</title>
    <style>
      :root {
        color-scheme: dark;
        background: #101418;
        color: #eef3f8;
        font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
      }
      body {
        margin: 0;
      }
      [data-terminal-root] {
        min-height: 100vh;
        outline: none;
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
      const root = document.querySelector("[data-terminal-root]");
      const state = { input: "", stable: false };

      function rows() {
        if (state.stable) {
          return [
            "Deterministic Agent Ready",
            "Type help or status. Ctrl+C exits.",
            "agent[1]> status",
            "",
            "Status: stable",
            "Mode: browser regression",
            "agent[2]> " + state.input,
          ];
        }

        return [
          "Deterministic Agent Ready",
          "Type help or status. Ctrl+C exits.",
          "agent[1]> " + state.input,
        ];
      }

      function render() {
        const grid = document.createElement("div");
        grid.className = "term-grid";
        for (const line of rows()) {
          const row = document.createElement("div");
          row.className = "term-row";
          const span = document.createElement("span");
          span.textContent = line;
          row.appendChild(span);
          grid.appendChild(row);
        }
        root.replaceChildren(grid);
      }

      root.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          if (state.input.trim() === "status") {
            state.stable = true;
          }
          state.input = "";
          event.preventDefault();
          render();
          return;
        }

        if (event.key === "Backspace") {
          state.input = state.input.slice(0, -1);
          event.preventDefault();
          render();
          return;
        }

        if (event.key.length === 1) {
          state.input += event.key;
          event.preventDefault();
          render();
        }
      });

      root.addEventListener("click", () => root.focus());
      root.focus();
      render();
    </script>
  </body>
</html>`;
}
