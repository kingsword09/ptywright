import { Buffer } from "node:buffer";

import type { PtyProcess } from "../pty/pty_adapter";
import {
  createDefaultPtyAdapter,
  type PtyBackend,
  resolvePtyBackend,
} from "../pty/default_adapter";
import { createPtyCassetteReplay } from "./replay";
import { inspectPtyCassettePath, formatPtyCassetteInspectLines } from "./inspect";
import { readPtyCassettePath } from "./io";
import { validatePtyCassette } from "./schema";
import { createPtyCassetteRecorder } from "./recorder";
import { wrapPtyLike, type PtyLike } from "./pty_like";

export function ptyUsage(): string {
  return [
    "ptywright pty <command>",
    "",
    "Commands:",
    "  pty record --out <file> -- <command> [args...]  Record a raw PTY cassette",
    "  pty replay <file>                               Replay recorded PTY output",
    "  pty inspect <file>                              Print cassette summary",
    "  pty validate <file>                             Validate cassette schema",
    "",
    "Record options:",
    "  --out <file>             Output cassette JSON path",
    "  --cols <n>               Terminal columns (default: stdout cols or 80)",
    "  --rows <n>               Terminal rows (default: stdout rows or 24)",
    "  --term <name>            TERM/name value (default: xterm-256color)",
    "  --cwd <dir>              Child working directory (default: cwd)",
    "  --backend <name>         auto|bun-terminal|bun-pty",
    "  --env KEY=VALUE          Add/override child env (repeatable)",
    "",
    "Replay/inspect/validate options:",
    "  --speed <n>              Replay timing multiplier; 0 means instant (default: 0)",
    "  --json                   Print machine-readable output",
  ].join("\n");
}

export async function cmdPty(argv: string[]): Promise<number> {
  const [mode, ...rest] = argv;

  if (isHelp(mode)) {
    // eslint-disable-next-line no-console
    console.log(ptyUsage());
    return 0;
  }

  if (mode === "record") {
    const args = parseRecordArgs(rest);
    const result = await recordPtyCassetteCommand(args);
    // eslint-disable-next-line no-console
    console.log(`record=${result.path}`);
    // eslint-disable-next-line no-console
    console.log(`events=${result.eventCount}`);
    return result.exitCode;
  }

  if (mode === "replay") {
    const args = parseReplayArgs(rest);
    const replay = createPtyCassetteReplay(args.path, { speed: args.speed });
    replay.onData((data) => {
      process.stdout.write(data);
    });
    await replay.start();
    return 0;
  }

  if (mode === "inspect") {
    const args = parseArtifactArgs(rest);
    const result = inspectPtyCassettePath(args.path);
    if (args.json) {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(result, null, 2));
    } else {
      for (const line of formatPtyCassetteInspectLines(result)) {
        // eslint-disable-next-line no-console
        console.log(line);
      }
    }
    return 0;
  }

  if (mode === "validate") {
    const args = parseArtifactArgs(rest);
    const result = validatePtyCassette(JSON.parse(await Bun.file(args.path).text()) as unknown);
    if (args.json) {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(result.ok ? { ok: true, path: args.path } : result, null, 2));
    } else if (result.ok) {
      // eslint-disable-next-line no-console
      console.log(`ok pty-cassette path=${args.path}`);
    } else {
      for (const error of result.errors) {
        // eslint-disable-next-line no-console
        console.error(error);
      }
    }
    return result.ok ? 0 : 1;
  }

  throw new Error("missing pty subcommand: record|replay|inspect|validate\n\n" + ptyUsage());
}

export type RecordPtyCassetteCommandArgs = {
  outPath: string;
  command: string;
  args: string[];
  cols: number;
  rows: number;
  term: string;
  cwd: string;
  backend: PtyBackend;
  env: Record<string, string>;
};

export type RecordPtyCassetteCommandResult = {
  path: string;
  eventCount: number;
  exitCode: number;
};

export async function recordPtyCassetteCommand(
  args: RecordPtyCassetteCommandArgs,
): Promise<RecordPtyCassetteCommandResult> {
  const env = mergeEnv({ TERM: args.term, COLORTERM: "truecolor" }, args.env);
  const adapter = createDefaultPtyAdapter(args.backend);
  const pty = adapter.spawn(args.command, args.args, {
    cols: args.cols,
    rows: args.rows,
    cwd: args.cwd,
    env,
    name: args.term,
  });
  const recorder = createPtyCassetteRecorder({
    terminal: { cols: args.cols, rows: args.rows, term: args.term },
    command: {
      file: args.command,
      args: args.args,
      cwd: args.cwd,
      env: args.env,
    },
  });
  const wrapped = wrapPtyLike(toPtyLike(pty), { recorder });
  const cleanup = attachInteractiveBridge(wrapped, args);

  const exit = await new Promise<{ exitCode: number }>((resolveExit) => {
    wrapped.onExit((event) => {
      resolveExit({ exitCode: event.exitCode });
    });
  });

  cleanup();
  wrapped.writeCassette(args.outPath);
  const cassette = readPtyCassettePath(args.outPath);
  wrapped.dispose();

  return {
    path: args.outPath,
    eventCount: cassette.events.length,
    exitCode: exit.exitCode,
  };
}

function parseRecordArgs(argv: string[]): RecordPtyCassetteCommandArgs {
  const out: Partial<RecordPtyCassetteCommandArgs> & {
    env: Record<string, string>;
  } = {
    cols: terminalCols(),
    rows: terminalRows(),
    term: "xterm-256color",
    cwd: process.cwd(),
    backend: resolvePtyBackend(undefined),
    env: {},
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === "--") {
      const [command, ...args] = argv.slice(i + 1);
      if (!command) throw new Error("missing command after --\n\n" + ptyUsage());
      out.command = command;
      out.args = args;
      break;
    }

    if (!arg) continue;

    if (!arg.startsWith("-")) {
      out.command = arg;
      out.args = argv.slice(i + 1);
      break;
    }

    if (arg === "--out" && next) {
      out.outPath = next;
      i += 1;
      continue;
    }

    if (arg === "--cols" && next) {
      out.cols = parsePositiveInt(next, "--cols");
      i += 1;
      continue;
    }

    if (arg === "--rows" && next) {
      out.rows = parsePositiveInt(next, "--rows");
      i += 1;
      continue;
    }

    if (arg === "--term" && next) {
      out.term = next;
      i += 1;
      continue;
    }

    if (arg === "--cwd" && next) {
      out.cwd = next;
      i += 1;
      continue;
    }

    if (arg === "--backend" && next) {
      out.backend = resolvePtyBackend(next);
      i += 1;
      continue;
    }

    if (arg === "--env" && next) {
      const eq = next.indexOf("=");
      if (eq <= 0) throw new Error(`invalid --env: ${next}`);
      out.env[next.slice(0, eq)] = next.slice(eq + 1);
      i += 1;
      continue;
    }

    throw new Error(`unknown arg: ${arg}\n\n` + ptyUsage());
  }

  if (!out.outPath) throw new Error("missing --out <file>\n\n" + ptyUsage());
  if (!out.command) throw new Error("missing command to record\n\n" + ptyUsage());

  return {
    outPath: out.outPath,
    command: out.command,
    args: out.args ?? [],
    cols: out.cols ?? terminalCols(),
    rows: out.rows ?? terminalRows(),
    term: out.term ?? "xterm-256color",
    cwd: out.cwd ?? process.cwd(),
    backend: out.backend ?? "auto",
    env: out.env,
  };
}

function parseReplayArgs(argv: string[]): { path: string; speed: number } {
  const out: { path?: string; speed: number } = { speed: 0 };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (!out.path && arg && !arg.startsWith("-")) {
      out.path = arg;
      continue;
    }

    if (arg === "--speed" && next) {
      const speed = Number.parseFloat(next);
      if (!Number.isFinite(speed) || speed < 0) {
        throw new Error(`invalid --speed: ${next}`);
      }
      out.speed = speed;
      i += 1;
      continue;
    }

    throw new Error(`unknown arg: ${arg ?? ""}\n\n` + ptyUsage());
  }

  if (!out.path) throw new Error("missing <file>\n\n" + ptyUsage());
  return { path: out.path, speed: out.speed };
}

function parseArtifactArgs(argv: string[]): { path: string; json: boolean } {
  const out: { path?: string; json: boolean } = { json: false };

  for (const arg of argv) {
    if (!out.path && arg && !arg.startsWith("-")) {
      out.path = arg;
      continue;
    }

    if (arg === "--json") {
      out.json = true;
      continue;
    }

    throw new Error(`unknown arg: ${arg ?? ""}\n\n` + ptyUsage());
  }

  if (!out.path) throw new Error("missing <file>\n\n" + ptyUsage());
  return { path: out.path, json: out.json };
}

function attachInteractiveBridge(pty: PtyLike, args: { cols: number; rows: number }): () => void {
  const onData = (data: unknown) => {
    process.stdout.write(typeof data === "string" ? data : Buffer.from(data as Uint8Array));
  };
  const onInput = (data: Buffer | string) => {
    void pty.write(data);
  };
  const onResize = () => {
    void pty.resize?.(terminalCols(args.cols), terminalRows(args.rows));
  };
  const rawState = setRawMode(true);
  const outputDisposable = pty.onData(onData);

  process.stdin.on("data", onInput);
  process.on("SIGWINCH", onResize);

  return () => {
    dispose(outputDisposable);
    process.stdin.off("data", onInput);
    process.off("SIGWINCH", onResize);
    setRawMode(rawState);
  };
}

function toPtyLike(pty: PtyProcess): PtyLike {
  return {
    write: (data) => pty.write(typeof data === "string" ? data : Buffer.from(data).toString()),
    resize: (cols, rows) => pty.resize(cols, rows),
    kill: (signal) => pty.kill(signal),
    onData: (listener) => pty.onData(listener),
    onExit: (listener) => pty.onExit(listener),
  };
}

function terminalCols(fallback = 80): number {
  return process.stdout.columns && process.stdout.columns > 0 ? process.stdout.columns : fallback;
}

function terminalRows(fallback = 24): number {
  return process.stdout.rows && process.stdout.rows > 0 ? process.stdout.rows : fallback;
}

function parsePositiveInt(value: string, name: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`invalid ${name}: ${value}`);
  }
  return parsed;
}

function mergeEnv(
  base: Record<string, string>,
  override: Record<string, string>,
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") env[key] = value;
  }
  for (const [key, value] of Object.entries(base)) env[key] = value;
  for (const [key, value] of Object.entries(override)) env[key] = value;
  return env;
}

function setRawMode(enabled: boolean): boolean {
  if (!process.stdin.isTTY) return false;
  const stdin = process.stdin as typeof process.stdin & { isRaw?: boolean };
  const wasRaw = Boolean(stdin.isRaw);
  process.stdin.setRawMode(enabled);
  process.stdin.resume();
  return wasRaw;
}

function dispose(disposable: { dispose(): void } | (() => void) | void): void {
  if (!disposable) return;
  if (typeof disposable === "function") disposable();
  else disposable.dispose();
}

function isHelp(arg: string | undefined): boolean {
  return arg === "-h" || arg === "--help" || arg === "help";
}
