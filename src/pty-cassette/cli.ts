import { mergeProcessEnv } from "../common/env";
import { createDefaultPtyAdapter } from "../pty/default_adapter";
import { attachInteractiveBridge, toPtyLike } from "./cli_bridge";
import { createPtyCassetteReplay } from "./replay";
import { inspectPtyCassettePath, formatPtyCassetteInspectLines } from "./inspect";
import { readPtyCassettePath } from "./io";
import { validatePtyCassette } from "./schema";
import { createPtyCassetteRecorder } from "./recorder";
import { wrapPtyLike } from "./pty_like";
import {
  parseArtifactArgs,
  parseRecordArgs,
  parseReplayArgs,
  type RecordPtyCassetteCommandArgs,
} from "./cli_args";
import { isPtyHelpArg, ptyUsage } from "./cli_usage";

export { ptyUsage } from "./cli_usage";
export type { RecordPtyCassetteCommandArgs } from "./cli_args";

export async function cmdPty(argv: string[]): Promise<number> {
  const [mode, ...rest] = argv;

  if (isPtyHelpArg(mode)) {
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

export type RecordPtyCassetteCommandResult = {
  path: string;
  eventCount: number;
  exitCode: number;
};

export async function recordPtyCassetteCommand(
  args: RecordPtyCassetteCommandArgs,
): Promise<RecordPtyCassetteCommandResult> {
  const env = mergeProcessEnv({ TERM: args.term, COLORTERM: "truecolor" }, args.env);
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
