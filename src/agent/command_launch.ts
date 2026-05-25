import { spawn, type ChildProcessByStdio } from "node:child_process";
import { resolve } from "node:path";
import type { Readable } from "node:stream";

import type { AgentLaunch } from "./schema";

const DEFAULT_URL_REGEX = /https?:\/\/[^\s"'<>]+/;

export type BrowserLaunchCommand = {
  file: string;
  args: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  label?: string;
  urlRegex?: string;
  waitForUrlMs?: number;
};

export type AgentBrowserSession = {
  url: string;
  process: BrowserLaunchProcess;
  close: () => Promise<void>;
};

type BrowserLaunchProcess = ChildProcessByStdio<null, Readable, Readable>;

export function buildCommandLaunchCommand(
  launch: AgentLaunch,
  options: {
    env?: NodeJS.ProcessEnv;
    rootDir?: string;
  } = {},
): BrowserLaunchCommand {
  if (!launch.command) {
    throw new Error("launch.command is required when launch.mode is 'command'");
  }

  const rootDir = options.rootDir ?? process.cwd();
  const cwd = launch.cwd ? resolve(rootDir, launch.cwd) : rootDir;

  return {
    file: launch.command,
    args: launch.args ?? [],
    cwd,
    env: { ...(options.env ?? process.env), ...launch.env },
    label: launch.command,
    urlRegex: launch.urlRegex,
    waitForUrlMs: launch.waitForUrlMs,
  };
}

export async function launchBrowserSessionFromCommand(
  command: BrowserLaunchCommand,
): Promise<AgentBrowserSession> {
  const timeoutMs = command.waitForUrlMs ?? 15_000;
  const child = spawn(command.file, command.args, {
    cwd: command.cwd,
    env: command.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];

  const url = await new Promise<string>((resolveUrl, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      finish(
        new Error(
          `timed out after ${timeoutMs}ms waiting for ${command.label ?? command.file} session URL\n` +
            `stdout=${stdoutChunks.join("").trim()}\n` +
            `stderr=${stderrChunks.join("").trim()}`,
        ),
      );
    }, timeoutMs);

    const finish = (result: string | Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.stdout.off("data", onStdout);
      child.stderr.off("data", onStderr);
      child.off("error", onError);
      child.off("exit", onExit);

      if (result instanceof Error) reject(result);
      else resolveUrl(result);
    };

    const readUrl = () => {
      const found = extractUrlFromOutput(
        `${stdoutChunks.join("")}\n${stderrChunks.join("")}`,
        command.urlRegex,
      );
      if (found) finish(found);
    };

    const onStdout = (chunk: Buffer) => {
      stdoutChunks.push(chunk.toString("utf8"));
      readUrl();
    };

    const onStderr = (chunk: Buffer) => {
      stderrChunks.push(chunk.toString("utf8"));
      readUrl();
    };

    const onError = (error: Error) => finish(error);

    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      finish(
        new Error(
          `${command.label ?? command.file} exited before printing a session URL ` +
            `(code=${code ?? "null"} signal=${signal ?? "null"})\n` +
            `stdout=${stdoutChunks.join("").trim()}\n` +
            `stderr=${stderrChunks.join("").trim()}`,
        ),
      );
    };

    child.stdout.on("data", onStdout);
    child.stderr.on("data", onStderr);
    child.once("error", onError);
    child.once("exit", onExit);
  });

  return {
    url,
    process: child,
    close: () => closeChild(child),
  };
}

export function extractUrlFromOutput(output: string, regexSource?: string): string | null {
  if (!regexSource) {
    return output.match(DEFAULT_URL_REGEX)?.[0] ?? null;
  }

  const match = output.match(new RegExp(regexSource, "m"));
  return match?.[1] ?? match?.[0] ?? null;
}

export function formatBrowserLaunchCommand(command: BrowserLaunchCommand): string {
  return [command.file, ...command.args].join(" ");
}

async function closeChild(child: BrowserLaunchProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  await new Promise<void>((resolveClose) => {
    const timer = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
      }
      resolveClose();
    }, 2_000);

    child.once("exit", () => {
      clearTimeout(timer);
      resolveClose();
    });

    child.kill("SIGTERM");
  });
}
