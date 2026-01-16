import { spawn } from "bun-pty";
import type { IPty, IPtyForkOptions } from "bun-pty";

import type { PtyAdapter, PtyProcess, PtySpawnOptions } from "./pty_adapter";

function toForkOptions(options: PtySpawnOptions): IPtyForkOptions {
  return {
    name: options.name,
    cols: options.cols,
    rows: options.rows,
    cwd: options.cwd,
    env: options.env,
  };
}

function toPtyProcess(pty: IPty): PtyProcess {
  return {
    pid: pty.pid,
    cols: pty.cols,
    rows: pty.rows,
    write: (data) => pty.write(data),
    resize: (cols, rows) => pty.resize(cols, rows),
    kill: (signal) => pty.kill(signal),
    onData: (listener) => pty.onData(listener),
    onExit: (listener) => pty.onExit(listener),
  };
}

export class BunPtyAdapter implements PtyAdapter {
  spawn(command: string, args: string[], options: PtySpawnOptions): PtyProcess {
    const pty = spawn(command, args, toForkOptions(options));
    return toPtyProcess(pty);
  }
}
