import { Buffer } from "node:buffer";

import type { PtyProcess } from "../pty/pty_adapter";
import { terminalCols, terminalRows } from "./cli_terminal";
import type { PtyLike } from "./pty_like";

export function attachInteractiveBridge(
  pty: PtyLike,
  args: { cols: number; rows: number },
): () => void {
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

export function toPtyLike(pty: PtyProcess): PtyLike {
  return {
    write: (data) => pty.write(typeof data === "string" ? data : Buffer.from(data).toString()),
    resize: (cols, rows) => pty.resize(cols, rows),
    kill: (signal) => pty.kill(signal),
    onData: (listener) => pty.onData(listener),
    onExit: (listener) => pty.onExit(listener),
  };
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
