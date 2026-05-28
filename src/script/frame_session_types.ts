import type { SnapshotFrame, TerminalSessionCloseReason } from "../session/terminal_session_types";
import type { TextMaskRule } from "../terminal/mask";
import type { MouseEvent } from "../terminal/mouse";
import type { SnapshotScope, TerminalSnapshotGrid } from "../terminal/snapshot";
import type { TerminalMeta } from "../terminal/view";
import type { TraceSnapshot } from "../trace/recorder";

export type ScriptBackend = "pty" | "frames" | "ink" | "ratatui";

export type SnapshotTextOptions = {
  scope?: SnapshotScope;
  trimRight?: boolean;
  trimBottom?: boolean;
  maxLines?: number;
  tailLines?: number;
  captureFrame?: boolean;
  mask?: TextMaskRule[];
};

export type SnapshotAnsiOptions = SnapshotTextOptions;

export type ScriptSession = {
  readonly id: string;
  resize(cols: number, rows: number): void;
  sendText(text: string, options?: { enter?: boolean }): void;
  pressKey(key: string): void;
  sendMouse(event: MouseEvent): void;
  mark(label?: string): void;
  flush(): Promise<void>;
  getMeta(): TerminalMeta;
  snapshotText(options?: SnapshotTextOptions): Promise<{ text: string; hash: string }>;
  snapshotAnsi(options?: SnapshotAnsiOptions): Promise<{
    ansi: string;
    plain: string;
    hash: string;
    lines: Array<{ ansi: string; plain: string }>;
  }>;
  snapshotGrid(options?: {
    trimRight?: boolean;
    includeStyles?: boolean;
    captureFrame?: boolean;
  }): Promise<{ grid: TerminalSnapshotGrid; hash: string }>;
  snapshotCast(options?: { tailEvents?: number }): Promise<TraceSnapshot>;
  waitForText(args: {
    scope?: SnapshotScope;
    text?: string;
    regex?: RegExp;
    timeoutMs: number;
    intervalMs: number;
  }): Promise<{ found: boolean; text: string; hash: string }>;
  waitForStableScreen(args: {
    quietMs: number;
    timeoutMs: number;
    intervalMs: number;
  }): Promise<{ stable: boolean; text: string; hash: string }>;
  isClosed(): boolean;
  getCloseReason(): TerminalSessionCloseReason | null;
  close(): void;
  getSnapshotFrames(): SnapshotFrame[];
  getRawOutputChunks(): string[];
};

export type FrameSessionOptions = {
  id?: string;
  backend: Exclude<ScriptBackend, "pty">;
  frames: readonly string[];
  cols?: number;
  rows?: number;
  title?: string;
  advanceOnInput?: boolean;
};
