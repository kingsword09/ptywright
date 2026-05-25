import type { PtyExitEvent } from "../pty/pty_adapter";
import { byteLength, dataToBase64, type PtyCassetteData } from "./data";
import { writePtyCassettePath } from "./io";
import {
  normalizePtyCassette,
  PTY_CASSETTE_SCHEMA_URL,
  type PtyCassette,
  type PtyCassetteEvent,
} from "./schema";

export type PtyCassetteRecorderOptions = {
  terminal: {
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

export class PtyCassetteRecorder {
  private readonly startedAtMs = performance.now();
  private readonly cassette: PtyCassette;

  constructor(options: PtyCassetteRecorderOptions) {
    this.cassette = {
      $schema: PTY_CASSETTE_SCHEMA_URL,
      version: 1,
      createdAt: new Date().toISOString(),
      durationMs: 0,
      terminal: options.terminal,
      command: options.command,
      metadata: options.metadata,
      events: [],
    };
  }

  recordOutput(data: PtyCassetteData): void {
    this.recordData("output", data);
  }

  recordInput(data: PtyCassetteData): void {
    this.recordData("input", data);
  }

  recordResize(cols: number, rows: number): void {
    this.pushEvent({ atMs: this.nowMs(), type: "resize", cols, rows });
  }

  recordExit(event: PtyExitEvent): void {
    this.pushEvent({
      atMs: this.nowMs(),
      type: "exit",
      exitCode: event.exitCode,
      signal: event.signal ?? null,
    });
    this.cassette.durationMs = this.nowMs();
  }

  snapshot(): PtyCassette {
    this.cassette.durationMs = this.nowMs();
    return normalizePtyCassette({
      ...this.cassette,
      terminal: { ...this.cassette.terminal },
      command: this.cassette.command
        ? {
            ...this.cassette.command,
            args: this.cassette.command.args ? [...this.cassette.command.args] : undefined,
            env: this.cassette.command.env ? { ...this.cassette.command.env } : undefined,
          }
        : undefined,
      metadata: this.cassette.metadata ? { ...this.cassette.metadata } : undefined,
      events: this.cassette.events.map((event) => ({ ...event })),
    });
  }

  stop(): PtyCassette {
    return this.snapshot();
  }

  writePath(path: string): string {
    return writePtyCassettePath(path, this.snapshot());
  }

  private recordData(type: "output" | "input", data: PtyCassetteData): void {
    if (byteLength(data) === 0) return;
    this.pushEvent({
      atMs: this.nowMs(),
      type,
      dataBase64: dataToBase64(data),
    });
  }

  private pushEvent(event: PtyCassetteEvent): void {
    this.cassette.events.push(event);
    this.cassette.durationMs = Math.max(this.cassette.durationMs, event.atMs);
  }

  private nowMs(): number {
    return Math.max(0, Math.round(performance.now() - this.startedAtMs));
  }
}

export function createPtyCassetteRecorder(
  options: PtyCassetteRecorderOptions,
): PtyCassetteRecorder {
  return new PtyCassetteRecorder(options);
}
