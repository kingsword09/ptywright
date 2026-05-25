import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { applyTextMaskRules, type TextMaskRule } from "../terminal/mask";
import { encodeKey } from "../terminal/keys";
import { encodeSgrMouse, type MouseEvent } from "../terminal/mouse";
import type { SnapshotScope, TerminalSnapshotGrid } from "../terminal/snapshot";
import type { TerminalMeta } from "../terminal/view";
import { TraceRecorder, type TraceSnapshot } from "../trace/recorder";
import { fnv1a32 } from "../util/hash";
import { sleep } from "../util/sleep";
import type { SnapshotFrame, TerminalSessionCloseReason } from "../session/terminal_session";
import type { Script } from "./schema";

export type ScriptBackend = "pty" | "frames" | "ink" | "ratatui";

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

type SnapshotTextOptions = {
  scope?: SnapshotScope;
  trimRight?: boolean;
  trimBottom?: boolean;
  maxLines?: number;
  tailLines?: number;
  captureFrame?: boolean;
  mask?: TextMaskRule[];
};

type SnapshotAnsiOptions = SnapshotTextOptions;

export type FrameSessionOptions = {
  id?: string;
  backend: Exclude<ScriptBackend, "pty">;
  frames: readonly string[];
  cols?: number;
  rows?: number;
  title?: string;
  advanceOnInput?: boolean;
};

type FrameLike =
  | string
  | {
      name?: string;
      text?: string;
      frame?: string;
      snapshot?: string;
      lastFrame?: string;
    };

export class FrameSession implements ScriptSession {
  readonly id: string;

  private readonly backend: Exclude<ScriptBackend, "pty">;
  private readonly frames: string[];
  private readonly advanceOnInput: boolean;
  private readonly trace: TraceRecorder;
  private readonly snapshotRing: SnapshotFrame[] = [];
  private readonly rawOutputRing: string[] = [];

  private colsValue: number;
  private rowsValue: number;
  private activeFrame = 0;
  private closed: TerminalSessionCloseReason | null = {
    type: "process_exit",
    exitCode: 0,
  };

  constructor(options: FrameSessionOptions) {
    if (options.frames.length === 0) {
      throw new Error("frame backend requires at least one frame");
    }

    this.id = options.id ?? crypto.randomUUID();
    this.backend = options.backend;
    this.frames = [...options.frames];
    this.advanceOnInput = options.advanceOnInput ?? true;
    this.colsValue = options.cols ?? inferCols(this.frames);
    this.rowsValue = options.rows ?? inferRows(this.frames);
    this.trace = new TraceRecorder({
      version: 2,
      width: this.colsValue,
      height: this.rowsValue,
      timestamp: Math.floor(Date.now() / 1000),
      title: options.title ?? `${options.backend} frame backend`,
      command: `${options.backend}:frame`,
      term: `${options.backend}-test-backend`,
    });

    this.recordCurrentFrameOutput();
  }

  get cols(): number {
    return this.colsValue;
  }

  get rows(): number {
    return this.rowsValue;
  }

  resize(cols: number, rows: number): void {
    this.colsValue = clampInt(cols, 1, 500);
    this.rowsValue = clampInt(rows, 1, 300);
    this.trace.recordResize(this.colsValue, this.rowsValue);
  }

  sendText(text: string, options?: { enter?: boolean }): void {
    const payload = options?.enter ? `${text}\r` : text;
    this.trace.recordInput(payload);
    this.advanceFrame();
  }

  pressKey(key: string): void {
    this.trace.recordInput(encodeKey(key));
    this.advanceFrame();
  }

  sendMouse(event: MouseEvent): void {
    this.trace.recordInput(encodeSgrMouse(event));
    this.advanceFrame();
  }

  mark(label?: string): void {
    this.trace.mark(label);
  }

  async flush(): Promise<void> {
    await Promise.resolve();
  }

  getMeta(): TerminalMeta {
    return {
      cols: this.colsValue,
      rows: this.rowsValue,
      bufferType: "normal",
      viewportY: 0,
      baseY: 0,
      length: this.visibleLines({ trimRight: true }).length,
      cursorX: 0,
      cursorY: Math.max(0, Math.min(this.rowsValue - 1, this.currentLines().length - 1)),
    };
  }

  async snapshotText(options?: SnapshotTextOptions): Promise<{ text: string; hash: string }> {
    if (options?.maxLines !== undefined && options.tailLines !== undefined) {
      throw new Error("snapshotText: maxLines and tailLines are mutually exclusive");
    }

    let lines =
      options?.scope === "buffer"
        ? this.currentLines({ trimRight: options?.trimRight })
        : this.visibleLines({ trimRight: options?.trimRight });

    if (options?.trimBottom ?? true) {
      lines = trimBottomEmptyLines(lines);
    }

    lines = sliceLines(lines, options);
    lines = applyTextMaskRules(lines, options?.mask);

    const text = lines.join("\n");
    const hash = fnv1a32(text);
    if (options?.captureFrame ?? true) {
      this.captureFrame(text, hash);
    }
    return { text, hash };
  }

  async snapshotAnsi(options?: SnapshotAnsiOptions): Promise<{
    ansi: string;
    plain: string;
    hash: string;
    lines: Array<{ ansi: string; plain: string }>;
  }> {
    const { text, hash } = await this.snapshotText(options);
    const lines = text.split("\n").map((line) => ({ ansi: line, plain: line }));
    return { ansi: text, plain: text, hash, lines };
  }

  async snapshotGrid(options?: {
    trimRight?: boolean;
    includeStyles?: boolean;
    captureFrame?: boolean;
  }): Promise<{ grid: TerminalSnapshotGrid; hash: string }> {
    const lines = this.visibleLines({ trimRight: options?.trimRight });
    const grid: TerminalSnapshotGrid = {
      cols: this.colsValue,
      rows: this.rowsValue,
      bufferType: "normal",
      cursorX: 0,
      cursorY: Math.max(0, Math.min(this.rowsValue - 1, this.currentLines().length - 1)),
      viewportY: 0,
      lines,
      styleRuns: options?.includeStyles ? lines.map(() => []) : undefined,
    };
    const hash = fnv1a32(JSON.stringify(grid));
    if (options?.captureFrame ?? true) {
      this.captureFrame(lines.join("\n"), hash);
    }
    return { grid, hash };
  }

  async snapshotCast(options?: { tailEvents?: number }): Promise<TraceSnapshot> {
    await this.flush();
    return this.trace.snapshot({ tailEvents: options?.tailEvents });
  }

  async waitForText(args: {
    scope?: SnapshotScope;
    text?: string;
    regex?: RegExp;
    timeoutMs: number;
    intervalMs: number;
  }): Promise<{ found: boolean; text: string; hash: string }> {
    const startedAt = Date.now();

    while (true) {
      const snapshot = await this.snapshotText({ scope: args.scope, captureFrame: true });
      if (args.text && snapshot.text.includes(args.text)) {
        return { found: true, ...snapshot };
      }
      if (args.regex && args.regex.test(snapshot.text)) {
        return { found: true, ...snapshot };
      }
      if (Date.now() - startedAt >= args.timeoutMs) {
        return { found: false, ...snapshot };
      }
      await sleep(Math.max(1, args.intervalMs));
    }
  }

  async waitForStableScreen(): Promise<{ stable: boolean; text: string; hash: string }> {
    const snapshot = await this.snapshotText({ captureFrame: true });
    return { stable: true, ...snapshot };
  }

  isClosed(): boolean {
    return this.closed !== null;
  }

  getCloseReason(): TerminalSessionCloseReason | null {
    return this.closed;
  }

  close(): void {
    if (!this.closed) {
      this.closed = { type: "closed_by_user" };
    }
  }

  getSnapshotFrames(): SnapshotFrame[] {
    return [...this.snapshotRing];
  }

  getRawOutputChunks(): string[] {
    return [...this.rawOutputRing];
  }

  private advanceFrame(): void {
    if (!this.advanceOnInput) return;
    if (this.activeFrame >= this.frames.length - 1) return;
    this.activeFrame += 1;
    this.recordCurrentFrameOutput();
  }

  private currentText(): string {
    return this.frames[this.activeFrame] ?? "";
  }

  private currentLines(options?: { trimRight?: boolean }): string[] {
    const trimRight = options?.trimRight ?? true;
    return normalizeNewlines(this.currentText())
      .split("\n")
      .map((line) => normalizeLineWidth(line, this.colsValue, trimRight));
  }

  private visibleLines(options?: { trimRight?: boolean }): string[] {
    const lines = this.currentLines(options).slice(0, this.rowsValue);
    while (lines.length < this.rowsValue) {
      lines.push("");
    }
    return lines;
  }

  private captureFrame(text: string, hash: string): void {
    this.snapshotRing.push({
      atMs: Date.now(),
      hash,
      text,
    });
    while (this.snapshotRing.length > 50) {
      this.snapshotRing.shift();
    }
  }

  private recordCurrentFrameOutput(): void {
    const text = this.currentText();
    const output = `\x1b[2J\x1b[H${text}`;
    this.rawOutputRing.push(text);
    while (this.rawOutputRing.length > 50) {
      this.rawOutputRing.shift();
    }
    this.trace.recordOutput(output);
  }
}

export async function createFrameSessionFromLaunch(args: {
  launch: Script["launch"];
  cwd: string;
  title: string;
}): Promise<FrameSession> {
  const backend = args.launch.backend;
  if (backend === undefined || backend === "pty") {
    throw new Error("createFrameSessionFromLaunch requires a non-pty backend");
  }

  const frames = await resolveLaunchFrames(args.launch, args.cwd, backend);
  return new FrameSession({
    backend,
    frames,
    cols: args.launch.cols,
    rows: args.launch.rows,
    title: args.title,
    advanceOnInput: args.launch.advanceOnInput,
  });
}

async function resolveLaunchFrames(
  launch: Script["launch"],
  cwd: string,
  backend: Exclude<ScriptBackend, "pty">,
): Promise<string[]> {
  const frames: string[] = [];

  if (launch.frames?.length) {
    frames.push(...normalizeFrames(launch.frames));
  }

  if (launch.frame !== undefined) {
    frames.push(launch.frame);
  }

  if (launch.framePath) {
    const path = resolveLaunchPath(cwd, launch.framePath);
    frames.push(readFileSync(path, "utf8").replace(/\n$/, ""));
  }

  if (launch.frameModule) {
    frames.push(...(await loadFrameModule(resolveLaunchPath(cwd, launch.frameModule), backend)));
  }

  if (frames.length === 0) {
    throw new Error(`launch.backend=${backend} requires frame, frames, framePath, or frameModule`);
  }

  return frames;
}

async function loadFrameModule(
  modulePath: string,
  backend: Exclude<ScriptBackend, "pty">,
): Promise<string[]> {
  const mod = (await import(pathToFileURL(modulePath).href)) as Record<string, unknown>;
  const source = await materializeFrameSource(selectModuleFrameSource(mod, backend));
  return normalizeFrames(source);
}

function selectModuleFrameSource(
  mod: Record<string, unknown>,
  backend: Exclude<ScriptBackend, "pty">,
): unknown {
  if (mod.frames !== undefined) return mod.frames;
  if (mod.default !== undefined) return mod.default;
  if (backend === "ink" && mod.lastFrame !== undefined) return mod.lastFrame;
  if (backend === "ink" && mod.frame !== undefined) return mod.frame;
  if (backend === "ratatui" && mod.snapshot !== undefined) return mod.snapshot;
  if (mod.frame !== undefined) return mod.frame;
  if (mod.snapshot !== undefined) return mod.snapshot;
  throw new Error(`frame module did not export frames/default/frame/snapshot/lastFrame`);
}

async function materializeFrameSource(source: unknown): Promise<unknown> {
  if (typeof source === "function") {
    return await (source as () => unknown | Promise<unknown>)();
  }
  return source;
}

function normalizeFrames(source: unknown): string[] {
  if (Array.isArray(source)) {
    return source.map((frame) => normalizeFrame(frame));
  }
  return [normalizeFrame(source)];
}

function normalizeFrame(frame: unknown): string {
  if (typeof frame === "string") {
    return normalizeNewlines(frame).replace(/\n$/, "");
  }

  if (typeof frame === "object" && frame !== null) {
    const value = frame as FrameLike;
    const text =
      typeof value.text === "string"
        ? value.text
        : typeof value.frame === "string"
          ? value.frame
          : typeof value.snapshot === "string"
            ? value.snapshot
            : typeof value.lastFrame === "string"
              ? value.lastFrame
              : undefined;
    if (text !== undefined) {
      return normalizeNewlines(text).replace(/\n$/, "");
    }
  }

  throw new Error("frame entries must be strings or objects with text/frame/snapshot/lastFrame");
}

function resolveLaunchPath(cwd: string, path: string): string {
  return isAbsolute(path) ? path : resolve(cwd, path);
}

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function normalizeLineWidth(line: string, cols: number, trimRight: boolean): string {
  const clipped = line.length > cols ? line.slice(0, cols) : line;
  return trimRight ? clipped.trimEnd() : clipped.padEnd(cols, " ");
}

function trimBottomEmptyLines(lines: string[]): string[] {
  let end = lines.length;
  while (end > 0 && (lines[end - 1] ?? "").trim() === "") {
    end -= 1;
  }
  return lines.slice(0, end);
}

function sliceLines(
  lines: string[],
  options?: { maxLines?: number; tailLines?: number },
): string[] {
  if (options?.maxLines !== undefined) {
    return lines.slice(0, Math.max(0, Math.trunc(options.maxLines)));
  }
  if (options?.tailLines !== undefined) {
    const tail = Math.max(0, Math.trunc(options.tailLines));
    return lines.slice(Math.max(0, lines.length - tail));
  }
  return lines;
}

function inferCols(frames: readonly string[]): number {
  const max = frames.reduce((acc, frame) => {
    const lines = normalizeNewlines(frame).split("\n");
    return Math.max(acc, ...lines.map((line) => line.length));
  }, 0);
  return clampInt(max || 80, 1, 500);
}

function inferRows(frames: readonly string[]): number {
  const max = frames.reduce((acc, frame) => {
    return Math.max(acc, normalizeNewlines(frame).split("\n").length);
  }, 0);
  return clampInt(max || 24, 1, 300);
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  const int = Math.trunc(value);
  if (int < min) return min;
  if (int > max) return max;
  return int;
}
