import type { Terminal, TerminalOptions } from "bun";

import type {
  Disposable,
  PtyAdapter,
  PtyExitEvent,
  PtyProcess,
  PtySpawnOptions,
} from "./pty_adapter";

type Listener<T> = (arg: T) => void;

function createDisposable<T>(set: Set<Listener<T>>, listener: Listener<T>): Disposable {
  return {
    dispose: () => {
      set.delete(listener);
    },
  };
}

export class BunTerminalAdapter implements PtyAdapter {
  spawn(command: string, args: string[], options: PtySpawnOptions): PtyProcess {
    if (process.platform === "win32") {
      throw new Error("Bun.Terminal PTY is only available on POSIX systems (Linux/macOS)");
    }

    let cols = options.cols;
    let rows = options.rows;

    const decoder = new TextDecoder();
    const dataListeners = new Set<Listener<string>>();
    const exitListeners = new Set<Listener<PtyExitEvent>>();

    const pendingData: string[] = [];
    let pendingExit: PtyExitEvent | null = null;

    const dispatchData = (chunk: string): void => {
      if (!chunk) return;
      if (dataListeners.size === 0) {
        pendingData.push(chunk);
        if (pendingData.length > 2000) {
          pendingData.splice(0, pendingData.length - 2000);
        }
        return;
      }
      for (const listener of dataListeners) listener(chunk);
    };

    const flushPendingDataTo = (listener: Listener<string>): void => {
      if (pendingData.length === 0) return;
      for (const chunk of pendingData) listener(chunk);
    };

    const dispatchExit = (event: PtyExitEvent): void => {
      pendingExit = event;
      for (const listener of exitListeners) listener(event);
    };

    const flushExitTo = (listener: Listener<PtyExitEvent>): void => {
      if (!pendingExit) return;
      listener(pendingExit);
    };

    const terminalOptions: TerminalOptions = {
      cols,
      rows,
      name: options.name,
      data: (_term, data) => {
        const text = decoder.decode(data, { stream: true });
        dispatchData(text);
      },
      exit: () => {
        const tail = decoder.decode();
        dispatchData(tail);
      },
    };

    let terminal: Terminal | undefined;
    let killed = false;

    const proc = Bun.spawn([command, ...args], {
      cwd: options.cwd,
      env: options.env,
      terminal: terminalOptions,
      onExit(subprocess, exitCode, _signalCode) {
        const tail = decoder.decode();
        dispatchData(tail);

        const signal = subprocess.signalCode ?? undefined;
        dispatchExit({
          exitCode: exitCode ?? (killed ? -1 : 0),
          signal,
        });
      },
    });

    terminal = proc.terminal;
    if (!terminal) {
      throw new Error("expected Bun.spawn(..., { terminal }) to attach a PTY terminal");
    }

    return {
      pid: proc.pid,
      get cols() {
        return cols;
      },
      get rows() {
        return rows;
      },
      write: (data) => {
        terminal?.write(data);
      },
      resize: (nextCols, nextRows) => {
        cols = nextCols;
        rows = nextRows;
        terminal?.resize(nextCols, nextRows);
      },
      kill: (signal) => {
        killed = true;
        if (signal) {
          proc.kill(signal as unknown as NodeJS.Signals);
        } else {
          proc.kill();
        }
        terminal?.close();
      },
      onData: (listener) => {
        dataListeners.add(listener);
        flushPendingDataTo(listener);
        if (dataListeners.size === 1) {
          queueMicrotask(() => {
            pendingData.length = 0;
          });
        }
        return createDisposable(dataListeners, listener);
      },
      onExit: (listener) => {
        exitListeners.add(listener);
        flushExitTo(listener);
        return createDisposable(exitListeners, listener);
      },
    };
  }
}
