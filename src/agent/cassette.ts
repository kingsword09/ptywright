import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";

import { z } from "zod";

import { shortHash } from "./normalize";
import {
  agentFlowSpecSchema,
  agentViewportSchema,
  normalizeAgentFlowSpec,
  type AgentFlowSpec,
} from "./schema";

export const AGENT_CASSETTE_SCHEMA_URL =
  "https://ptywright.local/schemas/ptywright-agent-cassette.schema.json";

export const agentCassetteFrameSchema = z.object({
  viewport: agentViewportSchema,
  phase: z.number().int().nonnegative(),
  stepIndex: z.number().int().nonnegative().nullable(),
  stepType: z.string().min(1),
  terminalText: z.string(),
  terminalHash: z.string().min(1),
  dom: z.string(),
  domHash: z.string().min(1),
  capturedAt: z.string().min(1),
});

export const agentCassetteSchema = z.object({
  $schema: z.string().optional(),
  version: z.literal(1),
  name: z.string().min(1),
  createdAt: z.string().min(1),
  spec: agentFlowSpecSchema.optional(),
  frames: z.array(agentCassetteFrameSchema).min(1),
});

export type AgentCassetteFrame = z.infer<typeof agentCassetteFrameSchema>;

export type AgentCassette = Omit<z.infer<typeof agentCassetteSchema>, "spec" | "frames"> & {
  spec: AgentFlowSpec;
  frames: AgentCassetteFrame[];
};

export type MutableAgentCassette = Omit<AgentCassette, "frames"> & {
  frames: AgentCassetteFrame[];
};

export type AgentCassetteFrameDraft = Omit<AgentCassetteFrame, "terminalHash" | "domHash">;

export type RawAgentCassette = {
  $schema?: string;
  version: 1;
  name: string;
  createdAt: string;
  spec?: unknown;
  frames: unknown[];
};

export type AgentCassetteServer = {
  url: string;
  close: () => Promise<void>;
};

export function createAgentCassette(name: string, spec: AgentFlowSpec): MutableAgentCassette {
  return {
    $schema: AGENT_CASSETTE_SCHEMA_URL,
    version: 1,
    name,
    createdAt: new Date().toISOString(),
    spec: normalizeAgentFlowSpec(spec),
    frames: [],
  };
}

export function normalizeAgentCassette(
  input: unknown,
  fallbackSpec?: AgentFlowSpec,
): AgentCassette {
  const parsed = agentCassetteSchema.parse(input);
  const specInput = parsed.spec ?? fallbackSpec;
  if (!specInput) {
    throw new Error("invalid agent cassette: missing spec");
  }
  validateCassetteFrameHashes(parsed.frames);

  return {
    ...parsed,
    $schema: parsed.$schema ?? AGENT_CASSETTE_SCHEMA_URL,
    spec: normalizeAgentFlowSpec(specInput),
  };
}

function validateCassetteFrameHashes(frames: readonly AgentCassetteFrame[]): void {
  for (const frame of frames) {
    const terminalHash = shortHash(frame.terminalText);
    if (terminalHash !== frame.terminalHash) {
      throw new Error(
        `invalid agent cassette: terminal hash mismatch viewport=${frame.viewport.name} phase=${frame.phase}`,
      );
    }

    const domHash = shortHash(frame.dom);
    if (domHash !== frame.domHash) {
      throw new Error(
        `invalid agent cassette: dom hash mismatch viewport=${frame.viewport.name} phase=${frame.phase}`,
      );
    }
  }
}

export function readAgentCassettePath(path: string, fallbackSpec?: AgentFlowSpec): AgentCassette {
  return normalizeAgentCassette(JSON.parse(readFileSync(path, "utf8")), fallbackSpec);
}

export function isAgentCassetteLike(input: unknown): input is RawAgentCassette {
  return (
    typeof input === "object" &&
    input !== null &&
    (input as { version?: unknown }).version === 1 &&
    Array.isArray((input as { frames?: unknown }).frames)
  );
}

export function upsertAgentCassetteFrame(
  cassette: MutableAgentCassette,
  frame: AgentCassetteFrameDraft,
): void {
  const next = {
    ...frame,
    terminalHash: shortHash(frame.terminalText),
    domHash: shortHash(frame.dom),
  };
  const index = cassette.frames.findIndex(
    (candidate) => candidate.viewport.name === next.viewport.name && candidate.phase === next.phase,
  );

  if (index >= 0) {
    cassette.frames[index] = next;
    return;
  }

  cassette.frames.push(next);
}

export async function startAgentCassetteServer(
  cassette: AgentCassette,
): Promise<AgentCassetteServer> {
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
    await closeServer(server);
    throw new Error("failed to bind cassette replay server");
  }

  return {
    url: `http://127.0.0.1:${address.port}/`,
    close: () => closeServer(server),
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

      function viewportScore(frame) {
        const viewport = frame.viewport || {};
        return Math.abs((viewport.width || window.innerWidth) - window.innerWidth) +
          Math.abs((viewport.height || window.innerHeight) - window.innerHeight);
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

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => {
      if (error) rejectClose(error);
      else resolveClose();
    });
  });
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
