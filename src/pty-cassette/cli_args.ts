import { resolvePtyBackend, type PtyBackend } from "../pty/default_adapter";
import { terminalCols, terminalRows } from "./cli_terminal";
import { ptyUsage } from "./cli_usage";

export { terminalCols, terminalRows } from "./cli_terminal";
export { isPtyHelpArg, ptyUsage } from "./cli_usage";

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

export type ReplayPtyCassetteArgs = {
  path: string;
  speed: number;
};

export type ArtifactPtyCassetteArgs = {
  path: string;
  json: boolean;
};

export function parseRecordArgs(argv: string[]): RecordPtyCassetteCommandArgs {
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

export function parseReplayArgs(argv: string[]): ReplayPtyCassetteArgs {
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

export function parseArtifactArgs(argv: string[]): ArtifactPtyCassetteArgs {
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

function parsePositiveInt(value: string, name: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`invalid ${name}: ${value}`);
  }
  return parsed;
}
