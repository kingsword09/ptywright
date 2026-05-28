import { Terminal } from "@xterm/headless";

import type { Disposable, PtyProcess } from "../pty/pty_adapter";
import { encodeKey } from "../terminal/keys";
import { encodeSgrMouse } from "../terminal/mouse";
import type { MouseEvent } from "../terminal/mouse";
import type { AnsiRenderedLine } from "../terminal/ansi";
import { snapshotGrid } from "../terminal/snapshot";
import type { TerminalSnapshotGrid } from "../terminal/snapshot";
import type { TerminalMeta } from "../terminal/view";
import { fnv1a32 } from "../util/hash";
import { TraceRecorder } from "../trace/recorder";
import type { TraceSnapshot } from "../trace/recorder";
import { snapshotSessionAnsi, snapshotSessionText } from "./terminal_session_snapshot";
import { waitForSessionText, waitForStableSessionScreen } from "./terminal_session_wait";
import type {
  SnapshotAnsiOptions,
  SnapshotFrame,
  SnapshotTextResult,
  SnapshotTextOptions,
  TerminalSessionCloseReason,
  TerminalSessionOptions,
  WaitForStableScreenArgs,
  WaitForStableScreenResult,
  WaitForTextArgs,
  WaitForTextResult,
} from "./terminal_session_types";

export type {
  SnapshotAnsiOptions,
  SnapshotFrame,
  SnapshotTextResult,
  SnapshotTextOptions,
  TerminalSessionCloseReason,
  TerminalSessionOptions,
  WaitForStableScreenArgs,
  WaitForStableScreenResult,
  WaitForTextArgs,
  WaitForTextResult,
} from "./terminal_session_types";

const ESC = "\x1b";

export class TerminalSession {
  readonly id: string;

  private readonly pty: PtyProcess;
  private readonly terminal: Terminal;
  private readonly snapshotRingSize: number;
  private readonly trace: TraceRecorder;

  private writeChain: Promise<void> = Promise.resolve();
  private readonly disposables: Disposable[] = [];
  private readonly rawOutputRing: string[] = [];
  private readonly snapshotRing: SnapshotFrame[] = [];

  private closed: TerminalSessionCloseReason | null = null;

  constructor(options: TerminalSessionOptions) {
    this.id = options.id;
    this.pty = options.pty;
    this.snapshotRingSize = options.snapshotRingSize;

    this.terminal = new Terminal({
      cols: options.cols,
      rows: options.rows,
      allowProposedApi: true,
      scrollback: 2000,
      convertEol: true,
    });

    this.trace = new TraceRecorder({
      version: 2,
      width: options.cols,
      height: options.rows,
      timestamp: Math.floor(Date.now() / 1000),
      env: options.trace?.env,
      title: options.trace?.title ?? options.id,
      command: options.trace?.command,
      term: options.trace?.env?.TERM,
    });

    this.disposables.push(
      this.terminal.parser.registerCsiHandler({ final: "n" }, (params) =>
        this.handleCsiDsr(params),
      ),
    );

    this.disposables.push(
      this.terminal.parser.registerCsiHandler({ final: "c" }, (params) => this.handleCsiDa(params)),
    );

    this.disposables.push(
      this.pty.onData((data) => {
        this.appendRawOutput(data);
        this.trace.recordOutput(data);
        this.enqueueWrite(data);
      }),
    );

    this.disposables.push(
      this.pty.onExit((event) => {
        this.closed = { type: "process_exit", exitCode: event.exitCode, signal: event.signal };
      }),
    );
  }

  get cols(): number {
    return this.terminal.cols;
  }

  get rows(): number {
    return this.terminal.rows;
  }

  isClosed(): boolean {
    return this.closed !== null;
  }

  getCloseReason(): TerminalSessionCloseReason | null {
    return this.closed;
  }

  resize(cols: number, rows: number): void {
    this.trace.recordResize(cols, rows);
    this.pty.resize(cols, rows);
    this.terminal.resize(cols, rows);
  }

  sendText(text: string, options?: { enter?: boolean }): void {
    const enter = options?.enter ?? false;
    const payload = enter ? `${text}\r` : text;
    this.trace.recordInput(payload);
    this.pty.write(payload);
  }

  pressKey(key: string): void {
    const encoded = encodeKey(key);
    this.trace.recordInput(encoded);
    this.pty.write(encoded);
  }

  sendMouse(event: MouseEvent): void {
    const encoded = encodeSgrMouse(event);
    this.trace.recordInput(encoded);
    this.pty.write(encoded);
  }

  async flush(): Promise<void> {
    await this.writeChain;
  }

  getMeta(): TerminalMeta {
    const buffer = this.terminal.buffer.active;
    return {
      cols: this.terminal.cols,
      rows: this.terminal.rows,
      bufferType: buffer.type,
      viewportY: buffer.viewportY,
      baseY: buffer.baseY,
      length: buffer.length,
      cursorX: buffer.cursorX,
      cursorY: buffer.cursorY,
    };
  }

  async snapshotText(options?: SnapshotTextOptions): Promise<SnapshotTextResult> {
    await this.flush();
    const { text, hash } = snapshotSessionText(this.terminal, options);
    if (options?.captureFrame ?? true) {
      this.captureFrame(text, hash);
    }
    return { text, hash };
  }

  async snapshotAnsi(options?: SnapshotAnsiOptions): Promise<{
    ansi: string;
    plain: string;
    hash: string;
    lines: AnsiRenderedLine[];
  }> {
    await this.flush();
    return snapshotSessionAnsi(this.terminal, options);
  }

  async snapshotGrid(options?: {
    trimRight?: boolean;
    includeStyles?: boolean;
    captureFrame?: boolean;
  }): Promise<{
    grid: TerminalSnapshotGrid;
    hash: string;
  }> {
    await this.flush();

    const grid = snapshotGrid(this.terminal, {
      trimRight: options?.trimRight,
      includeStyles: options?.includeStyles,
    });

    const hash = fnv1a32(JSON.stringify(grid));
    if (options?.captureFrame ?? true) {
      this.captureFrame(grid.lines.join("\n"), hash);
    }

    return { grid, hash };
  }

  async snapshotCast(options?: { tailEvents?: number }): Promise<TraceSnapshot> {
    await this.flush();
    return this.trace.snapshot({ tailEvents: options?.tailEvents });
  }

  mark(label?: string): void {
    this.trace.mark(label);
  }

  getSnapshotFrames(): SnapshotFrame[] {
    return [...this.snapshotRing];
  }

  getRawOutputChunks(): string[] {
    return [...this.rawOutputRing];
  }

  async waitForText(args: WaitForTextArgs): Promise<WaitForTextResult> {
    return waitForSessionText(this, args);
  }

  async waitForStableScreen(args: WaitForStableScreenArgs): Promise<WaitForStableScreenResult> {
    return waitForStableSessionScreen(this, args);
  }

  close(): void {
    if (this.closed === null) {
      this.closed = { type: "closed_by_user" };
    }
    this.pty.kill();
    for (const d of this.disposables) d.dispose();
    this.terminal.dispose();
  }

  private enqueueWrite(data: string): void {
    this.writeChain = this.writeChain.then(
      () =>
        new Promise<void>((resolve) => {
          this.terminal.write(data, resolve);
        }),
    );
  }

  private appendRawOutput(data: string): void {
    this.rawOutputRing.push(data);
    if (this.rawOutputRing.length > 2000) {
      this.rawOutputRing.splice(0, this.rawOutputRing.length - 2000);
    }
  }

  private captureFrame(text: string, hash: string): void {
    this.snapshotRing.push({ atMs: Date.now(), hash, text });
    if (this.snapshotRing.length > this.snapshotRingSize) {
      this.snapshotRing.splice(0, this.snapshotRing.length - this.snapshotRingSize);
    }
  }

  private writePtySafely(data: string): void {
    if (this.isClosed()) return;
    try {
      this.pty.write(data);
    } catch {
      // Ignore: PTY may have closed between trigger and response.
    }
  }

  private handleCsiDsr(params: (number | number[])[]): boolean {
    if (params.length !== 1) return false;

    const raw = params[0];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value === 5) {
      this.writePtySafely(`${ESC}[0n`);
      return true;
    }

    if (value !== 6) return false;

    const meta = this.getMeta();
    const row = meta.baseY + meta.cursorY - meta.viewportY + 1;
    const col = meta.cursorX + 1;
    this.writePtySafely(`${ESC}[${row};${col}R`);
    return true;
  }

  private handleCsiDa(params: (number | number[])[]): boolean {
    if (params.length > 1) return false;

    const raw = params[0];
    const value = raw === undefined ? 0 : Array.isArray(raw) ? raw[0] : raw;
    if (value !== 0) return false;

    this.writePtySafely(`${ESC}[?1;2c`);
    return true;
  }
}
