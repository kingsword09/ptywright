import { encodeKey } from "../terminal/keys";
import { encodeSgrMouse, type MouseEvent } from "../terminal/mouse";
import type { TerminalSnapshotGrid } from "../terminal/snapshot";
import type { TerminalMeta } from "../terminal/view";
import { TraceRecorder, type TraceSnapshot } from "../trace/recorder";
import type { SnapshotFrame, TerminalSessionCloseReason } from "../session/terminal_session_types";
import type { Script } from "./schema";
import { snapshotFrameAnsiFromText, snapshotFrameGrid, snapshotFrameText } from "./frame_snapshot";
import { resolveLaunchFrames } from "./frame_source";
import type {
  FrameSessionOptions,
  ScriptBackend,
  ScriptSession,
  SnapshotAnsiOptions,
  SnapshotTextOptions,
} from "./frame_session_types";
import {
  clampInt,
  inferCols,
  inferRows,
  normalizeLineWidth,
  normalizeNewlines,
} from "./frame_text";
import {
  waitForFrameStableScreen,
  waitForFrameText,
  type WaitForFrameTextArgs,
} from "./frame_wait";

export type {
  FrameSessionOptions,
  ScriptBackend,
  ScriptSession,
  SnapshotAnsiOptions,
  SnapshotTextOptions,
} from "./frame_session_types";

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
      cursorY: this.cursorY(),
    };
  }

  async snapshotText(options?: SnapshotTextOptions): Promise<{ text: string; hash: string }> {
    const lines =
      options?.scope === "buffer"
        ? this.currentLines({ trimRight: options?.trimRight })
        : this.visibleLines({ trimRight: options?.trimRight });
    const { text, hash } = snapshotFrameText(lines, options);
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
    return snapshotFrameAnsiFromText(text, hash);
  }

  async snapshotGrid(options?: {
    trimRight?: boolean;
    includeStyles?: boolean;
    captureFrame?: boolean;
  }): Promise<{ grid: TerminalSnapshotGrid; hash: string }> {
    const lines = this.visibleLines({ trimRight: options?.trimRight });
    const { grid, hash } = snapshotFrameGrid({
      lines,
      cols: this.colsValue,
      rows: this.rowsValue,
      cursorY: this.cursorY(),
      includeStyles: options?.includeStyles,
    });
    if (options?.captureFrame ?? true) {
      this.captureFrame(lines.join("\n"), hash);
    }
    return { grid, hash };
  }

  async snapshotCast(options?: { tailEvents?: number }): Promise<TraceSnapshot> {
    await this.flush();
    return this.trace.snapshot({ tailEvents: options?.tailEvents });
  }

  async waitForText(
    args: WaitForFrameTextArgs,
  ): Promise<{ found: boolean; text: string; hash: string }> {
    return waitForFrameText((options) => this.snapshotText(options), args);
  }

  async waitForStableScreen(): Promise<{ stable: boolean; text: string; hash: string }> {
    return waitForFrameStableScreen((options) => this.snapshotText(options));
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

  private cursorY(): number {
    return Math.max(0, Math.min(this.rowsValue - 1, this.currentLines().length - 1));
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
