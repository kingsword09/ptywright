import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";

import type { AgentLaunch } from "./schema";

export type AittyExecCommand = {
  file: string;
  args: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
};

export type AittyBrowserSession = {
  url: string;
  process: AittyProcess;
  close: () => Promise<void>;
};

type AittyProcess = ChildProcessByStdio<null, Readable, Readable>;

export function buildAittyExecCommand(
  launch: AgentLaunch,
  options: {
    env?: NodeJS.ProcessEnv;
    rootDir?: string;
  } = {},
): AittyExecCommand {
  if (!launch.command) {
    throw new Error("launch.command is required for aitty mode");
  }

  const rootDir = options.rootDir ?? process.cwd();
  const cwd = launch.cwd ? resolve(rootDir, launch.cwd) : rootDir;
  const aitty = launch.aitty ?? {};
  const cli = resolveAittyCliCommand(aitty.command, rootDir, options.env ?? process.env);

  const args = [...cli.args, "exec", "--launch", "print"];

  pushOption(args, "--cwd", cwd);
  pushOption(args, "--host", aitty.host);
  pushOption(args, "--port", aitty.port);
  pushOption(args, "--project", aitty.project);
  pushOption(args, "--label", aitty.label);
  pushOption(args, "--title", aitty.title);
  pushOption(args, "--subtitle", aitty.subtitle);
  pushOption(args, "--theme", aitty.theme && aitty.theme !== "auto" ? aitty.theme : undefined);
  pushOption(args, "--font-size", aitty.fontSize);
  pushOption(args, "--experimental-screen-mode", aitty.screenMode);

  args.push("--", launch.command, ...(launch.args ?? []));

  return {
    file: cli.file,
    args,
    cwd,
    env: { ...(options.env ?? process.env), ...launch.env },
  };
}

export async function launchAittyBrowserSession(
  launch: AgentLaunch,
  options: {
    env?: NodeJS.ProcessEnv;
    rootDir?: string;
  } = {},
): Promise<AittyBrowserSession> {
  const command = buildAittyExecCommand(launch, options);
  const timeoutMs = launch.aitty?.waitForUrlMs ?? 15_000;
  const child = spawn(command.file, command.args, {
    cwd: command.cwd,
    env: command.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const chunks: string[] = [];
  const stderrChunks: string[] = [];

  const url = await new Promise<string>((resolveUrl, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      finish(
        new Error(
          `timed out after ${timeoutMs}ms waiting for aitty session URL\nstderr=${stderrChunks.join("").trim()}`,
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

    const onStdout = (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      chunks.push(text);
      const found = extractAittyUrlFromOutput(chunks.join(""));
      if (found) finish(found);
    };

    const onStderr = (chunk: Buffer) => {
      stderrChunks.push(chunk.toString("utf8"));
    };

    const onError = (error: Error) => finish(error);

    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      finish(
        new Error(
          `aitty exited before printing a session URL (code=${code ?? "null"} signal=${signal ?? "null"})\n` +
            `stdout=${chunks.join("").trim()}\n` +
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

export function extractAittyUrlFromOutput(output: string): string | null {
  return output.match(/https?:\/\/[^\s"'<>]+/)?.[0] ?? null;
}

function resolveAittyCliCommand(
  explicitCommand: string | undefined,
  rootDir: string,
  env: NodeJS.ProcessEnv,
): { file: string; args: string[] } {
  if (explicitCommand) {
    return { file: explicitCommand, args: [] };
  }

  if (env.PTYWRIGHT_AITTY_CLI) {
    return { file: env.PTYWRIGHT_AITTY_CLI, args: [] };
  }

  const siblingDist = resolve(rootDir, "../aitty/packages/cli/dist/cli.js");
  if (existsSync(siblingDist)) {
    return { file: "node", args: [siblingDist] };
  }

  return { file: "aitty", args: [] };
}

function pushOption(args: string[], name: string, value: string | number | undefined): void {
  if (value === undefined || value === "") return;
  args.push(name, String(value));
}

async function closeChild(child: AittyProcess): Promise<void> {
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
