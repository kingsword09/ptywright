import type { AsciicastEvent, AsciicastHeader } from "./asciicast";
import { encodeAsciicast } from "./asciicast";

export type TraceRecorderOptions = {
  maxEvents?: number;
  maxDataChars?: number;
  mergeOutput?: boolean;
  timePrecisionMs?: number;
};

export type TraceSnapshot = {
  header: AsciicastHeader;
  events: AsciicastEvent[];
  cast: string;
  droppedEvents: number;
  droppedDataChars: number;
};

const DEFAULT_MAX_EVENTS = 50_000;
const DEFAULT_MAX_DATA_CHARS = 5_000_000;
const DEFAULT_TIME_PRECISION_MS = 1;

export class TraceRecorder {
  private readonly header: AsciicastHeader;
  private readonly startedAtMs: number;
  private readonly maxEvents: number;
  private readonly maxDataChars: number;
  private readonly mergeOutput: boolean;
  private readonly timePrecisionMs: number;

  private readonly events: AsciicastEvent[] = [];
  private dataChars = 0;
  private droppedEvents = 0;
  private droppedDataChars = 0;

  constructor(header: AsciicastHeader, options?: TraceRecorderOptions) {
    this.header = header;
    this.startedAtMs = performance.now();
    this.maxEvents = Math.max(1, Math.trunc(options?.maxEvents ?? DEFAULT_MAX_EVENTS));
    this.maxDataChars = Math.max(1, Math.trunc(options?.maxDataChars ?? DEFAULT_MAX_DATA_CHARS));
    this.mergeOutput = options?.mergeOutput ?? true;
    this.timePrecisionMs = Math.max(
      1,
      Math.trunc(options?.timePrecisionMs ?? DEFAULT_TIME_PRECISION_MS),
    );
  }

  recordOutput(data: string): void {
    this.addEvent("o", data);
  }

  recordInput(data: string): void {
    this.addEvent("i", data);
  }

  recordResize(cols: number, rows: number): void {
    this.addEvent("r", `${cols}x${rows}`);
  }

  mark(label?: string): void {
    this.addEvent("m", label ?? "");
  }

  snapshot(options?: { tailEvents?: number }): TraceSnapshot {
    const tailEvents = options?.tailEvents;
    const events = tailEvents
      ? this.events.slice(-Math.max(0, Math.trunc(tailEvents)))
      : [...this.events];
    return {
      header: this.header,
      events,
      cast: encodeAsciicast(this.header, events),
      droppedEvents: this.droppedEvents,
      droppedDataChars: this.droppedDataChars,
    };
  }

  private addEvent(type: AsciicastEvent[1], data: string): void {
    const timeSeconds = this.nowSeconds();

    const last = this.events.at(-1);
    if (this.mergeOutput && type === "o" && last && last[1] === "o" && last[0] === timeSeconds) {
      last[2] += data;
      this.dataChars += data.length;
      this.trim();
      return;
    }

    this.events.push([timeSeconds, type, data]);
    this.dataChars += data.length;
    this.trim();
  }

  private nowSeconds(): number {
    const elapsedMs = performance.now() - this.startedAtMs;
    const quantized = Math.round(elapsedMs / this.timePrecisionMs) * this.timePrecisionMs;
    return quantized / 1000;
  }

  private trim(): void {
    while (this.events.length > this.maxEvents || this.dataChars > this.maxDataChars) {
      const removed = this.events.shift();
      if (!removed) break;
      const chars = removed[2].length;
      this.dataChars -= chars;
      this.droppedEvents += 1;
      this.droppedDataChars += chars;
    }
  }
}
