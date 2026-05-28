import type { PtyProcess } from "../pty/pty_adapter";
import type { TextMaskRule } from "../terminal/mask";
import type { SnapshotScope } from "../terminal/snapshot";

export type TerminalSessionOptions = {
  id: string;
  pty: PtyProcess;
  cols: number;
  rows: number;
  snapshotRingSize: number;
  trace?: {
    command?: string;
    args?: string[];
    cwd?: string;
    env?: Record<string, string>;
    title?: string;
  };
};

export type SnapshotFrame = {
  atMs: number;
  hash: string;
  text: string;
};

export type TerminalSessionCloseReason =
  | { type: "closed_by_user" }
  | { type: "process_exit"; exitCode: number; signal?: number | string };

export type SnapshotTextOptions = {
  scope?: SnapshotScope;
  trimRight?: boolean;
  trimBottom?: boolean;
  maxLines?: number;
  tailLines?: number;
  captureFrame?: boolean;
  mask?: TextMaskRule[];
};

export type SnapshotAnsiOptions = {
  scope?: SnapshotScope;
  trimRight?: boolean;
  trimBottom?: boolean;
  maxLines?: number;
  tailLines?: number;
  mask?: TextMaskRule[];
};

export type SnapshotTextResult = {
  text: string;
  hash: string;
};

export type WaitForTextArgs = {
  scope?: SnapshotScope;
  text?: string;
  regex?: RegExp;
  timeoutMs: number;
  intervalMs: number;
};

export type WaitForTextResult = SnapshotTextResult & {
  found: boolean;
};

export type WaitForStableScreenArgs = {
  quietMs: number;
  timeoutMs: number;
  intervalMs: number;
};

export type WaitForStableScreenResult = SnapshotTextResult & {
  stable: boolean;
};
