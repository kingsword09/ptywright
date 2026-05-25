import type { Terminal, TerminalOptions } from "bun";

import type { PtyCassetteData } from "./data";
import type { PtyCassetteRecorder } from "./recorder";

export function wrapBunTerminalOptions(
  options: TerminalOptions,
  recorder: PtyCassetteRecorder,
): TerminalOptions {
  const onData = options.data;
  const onExit = options.exit;

  return {
    ...options,
    data: (terminal, data) => {
      recorder.recordOutput(data);
      onData?.(terminal, data);
    },
    exit: onExit ? (terminal) => onExit(terminal) : undefined,
  };
}

export function writeBunTerminalRecorded(
  terminal: Terminal,
  recorder: PtyCassetteRecorder,
  data: PtyCassetteData,
): void {
  recorder.recordInput(data);
  terminal.write(data);
}

export function resizeBunTerminalRecorded(
  terminal: Terminal,
  recorder: PtyCassetteRecorder,
  cols: number,
  rows: number,
): void {
  recorder.recordResize(cols, rows);
  terminal.resize(cols, rows);
}
