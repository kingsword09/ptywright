import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

type ExtractArgs = {
  promptPath: string;
  tool: string;
  outPath: string;
  jsonlPath?: string;
  stderrPath?: string;
  codexBin?: string;
  timeoutMs?: number;
};

type ToolCallEvent = {
  type: "item.completed";
  item: {
    type: "mcp_tool_call";
    server: string;
    tool: string;
    result?: {
      content?: Array<{ type?: string; text?: string }>;
      structured_content?: unknown;
    };
    error?: unknown;
  };
};

function parseArgs(argv: string[]): ExtractArgs {
  const out: Partial<ExtractArgs> = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === "--prompt" && next) {
      out.promptPath = next;
      i += 1;
      continue;
    }

    if (arg === "--tool" && next) {
      out.tool = next;
      i += 1;
      continue;
    }

    if (arg === "--out" && next) {
      out.outPath = next;
      i += 1;
      continue;
    }

    if (arg === "--jsonl" && next) {
      out.jsonlPath = next;
      i += 1;
      continue;
    }

    if (arg === "--stderr" && next) {
      out.stderrPath = next;
      i += 1;
      continue;
    }

    if (arg === "--codex" && next) {
      out.codexBin = next;
      i += 1;
      continue;
    }

    if (arg === "--timeout-ms" && next) {
      out.timeoutMs = Number(next);
      i += 1;
      continue;
    }

    throw new Error(`unknown arg: ${arg ?? ""}`);
  }

  if (!out.promptPath) throw new Error("missing --prompt <path>");
  if (!out.tool) throw new Error("missing --tool <name>");
  if (!out.outPath) throw new Error("missing --out <path>");

  return out as ExtractArgs;
}

function resolveCodexCommand(explicit?: string): string {
  if (explicit && explicit.trim()) return explicit;

  const env = process.env.CODEX_BIN;
  if (env && env.trim()) return env;

  const which = Bun.which("codex");
  if (which) return which;

  const home = process.env.HOME;
  if (home) {
    const candidates = [
      `${home}/.local/share/mise/shims/codex`,
      `${home}/.local/share/mise/installs/codex/latest/codex`,
      `${home}/.local/share/mise/installs/codex/0/codex`,
    ];

    for (const candidate of candidates) {
      if (existsSync(candidate)) return candidate;
    }
  }

  return "codex";
}

function firstTextContent(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) return null;

  for (const item of content) {
    if (!item || typeof item !== "object") continue;
    const type = (item as { type?: unknown }).type;
    const text = (item as { text?: unknown }).text;
    if (type === "text" && typeof text === "string") {
      return text;
    }
  }

  return null;
}

async function readLines(stream: ReadableStream<Uint8Array>, onLine: (line: string) => void) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();

  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    let idx = buffer.indexOf("\n");
    while (idx !== -1) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      onLine(line);
      idx = buffer.indexOf("\n");
    }
  }

  buffer += decoder.decode();
  if (buffer.length > 0) {
    onLine(buffer);
  }
}

function ensureParentDir(path: string): void {
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true });
}

async function run(args: ExtractArgs): Promise<void> {
  const codex = resolveCodexCommand(args.codexBin);
  const promptText = await Bun.file(args.promptPath).text();

  if (args.jsonlPath) ensureParentDir(args.jsonlPath);
  if (args.stderrPath) ensureParentDir(args.stderrPath);
  ensureParentDir(args.outPath);

  const stdoutTee = args.jsonlPath ? createWriteStream(args.jsonlPath) : null;
  const stderrTee = args.stderrPath ? createWriteStream(args.stderrPath) : null;

  const proc = Bun.spawn([codex, "exec", "--skip-git-repo-check", "--json", "-"], {
    cwd: process.cwd(),
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });

  void proc.stdin?.write(promptText);
  void proc.stdin?.end();

  const timeoutMs = args.timeoutMs ?? 120_000;
  const timeout = setTimeout(() => {
    try {
      proc.kill("SIGKILL");
    } catch {
      // ignore
    }
  }, timeoutMs);

  let extracted: string | null = null;

  void readLines(proc.stdout, (line) => {
    stdoutTee?.write(`${line}\n`);

    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) return;

    let event: unknown;
    try {
      event = JSON.parse(trimmed);
    } catch {
      return;
    }

    const typed = event as Partial<ToolCallEvent>;
    if (typed.type !== "item.completed") return;
    if (typed.item?.type !== "mcp_tool_call") return;
    if (typed.item.tool !== args.tool) return;

    extracted = firstTextContent(typed.item.result);
  });

  void readLines(proc.stderr, (line) => {
    // Codex sometimes logs `needs_follow_up` at ERROR level even on success;
    // it is noisy and not actionable for our harness scripts.
    if (/needs_follow_up: (true|false)\s*$/.test(line)) return;

    stderrTee?.write(`${line}\n`);
  });

  const exitCode = await proc.exited;
  clearTimeout(timeout);

  stdoutTee?.end();
  stderrTee?.end();

  if (exitCode !== 0) {
    throw new Error(`codex exec exited with code ${exitCode}`);
  }

  if (!extracted) {
    throw new Error(`did not capture tool output text for tool=${args.tool}`);
  }

  await Bun.write(args.outPath, extracted);
}

if (import.meta.main) {
  try {
    const args = parseArgs(process.argv.slice(2));
    await run(args);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}
