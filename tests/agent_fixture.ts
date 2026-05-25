import type { AgentFlowSpec } from "../src/agent/schema";

export function deterministicAgentLaunch(): AgentFlowSpec["launch"] {
  return {
    mode: "url",
    url: `data:text/html;charset=utf-8,${encodeURIComponent(renderDeterministicAgentHtml())}`,
  };
}

export function deterministicAgentSpec(args: {
  name: string;
  artifactsDir: string;
  snapshotDir: string;
  targets?: Array<"terminal" | "dom" | "screenshot">;
}): AgentFlowSpec {
  return {
    name: args.name,
    artifactsDir: args.artifactsDir,
    snapshotDir: args.snapshotDir,
    launch: deterministicAgentLaunch(),
    viewports: [{ name: "desktop", width: 900, height: 640 }],
    defaults: { timeoutMs: 30_000, screenshot: false },
    steps: [
      { type: "waitForText", text: "Deterministic Agent Ready" },
      { type: "snapshot", name: "ready", targets: args.targets ?? ["terminal", "dom"] },
    ],
  };
}

function renderDeterministicAgentHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Deterministic Agent Fixture</title>
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
