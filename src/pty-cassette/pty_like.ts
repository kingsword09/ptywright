import type { PtyExitEvent } from "../pty/pty_adapter";
import { createPtyCassetteRecorder, type PtyCassetteRecorder } from "./recorder";
import type { PtyCassette } from "./schema";
import type { PtyCassetteData } from "./data";

export type DisposableLike = { dispose(): void } | (() => void) | void;

export type PtyLike = {
  write(data: PtyCassetteData): void | Promise<void>;
  resize?(cols: number, rows: number): void | Promise<void>;
  kill?(signal?: string): void | Promise<void>;
  onData(listener: (data: PtyCassetteData) => void): DisposableLike;
  onExit(listener: (event: PtyExitEvent) => void): DisposableLike;
};

export type WrapPtyLikeOptions = {
  recorder?: PtyCassetteRecorder;
  path?: string;
  autoWriteOnExit?: boolean;
  terminal?: {
    cols: number;
    rows: number;
    term?: string;
  };
  command?: {
    file: string;
    args?: string[];
    cwd?: string;
    env?: Record<string, string>;
  };
  metadata?: Record<string, string | number | boolean | null>;
};

export type RecordedPtyLike<T extends PtyLike = PtyLike> = PtyLike & {
  readonly pty: T;
  readonly recorder: PtyCassetteRecorder;
  stopRecording(): PtyCassette;
  writeCassette(path?: string): string;
  dispose(): void;
};

export function wrapPtyLike<T extends PtyLike>(
  pty: T,
  options: WrapPtyLikeOptions = {},
): RecordedPtyLike<T> {
  const recorder =
    options.recorder ??
    createPtyCassetteRecorder({
      terminal: options.terminal ?? { cols: 80, rows: 24, term: "xterm-256color" },
      command: options.command,
      metadata: options.metadata,
    });
  const path = options.path;
  const autoWriteOnExit = options.autoWriteOnExit ?? Boolean(path);
  const disposables: DisposableLike[] = [];
  let disposed = false;

  disposables.push(pty.onData((data) => recorder.recordOutput(data)));
  disposables.push(
    pty.onExit((event) => {
      recorder.recordExit(event);
      if (path && autoWriteOnExit) {
        recorder.writePath(path);
      }
    }),
  );

  const wrapper: RecordedPtyLike<T> = {
    pty,
    recorder,
    write(data) {
      recorder.recordInput(data);
      return pty.write(data);
    },
    resize(cols, rows) {
      recorder.recordResize(cols, rows);
      return pty.resize?.(cols, rows);
    },
    kill(signal) {
      return pty.kill?.(signal);
    },
    onData(listener) {
      return pty.onData(listener);
    },
    onExit(listener) {
      return pty.onExit(listener);
    },
    stopRecording() {
      return recorder.stop();
    },
    writeCassette(nextPath = path) {
      if (!nextPath) {
        throw new Error("writeCassette requires a path");
      }
      return recorder.writePath(nextPath);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const disposable of disposables) {
        dispose(disposable);
      }
    },
  };

  return wrapper;
}

function dispose(disposable: DisposableLike): void {
  if (!disposable) return;
  if (typeof disposable === "function") {
    disposable();
    return;
  }
  disposable.dispose();
}
