import type { Disposable } from "../pty/pty_adapter";
import { base64ToBytes } from "./data";
import { readPtyCassettePath } from "./io";
import type { PtyCassette, PtyCassetteDataEvent, PtyCassetteEvent } from "./schema";

export type PtyCassetteReplayOptions = {
  speed?: number;
};

export type PtyCassetteReplayData = {
  event: PtyCassetteDataEvent;
  bytes: Uint8Array;
  text: string;
};

type Listener<T> = (value: T) => void;

export class PtyCassetteReplay {
  private readonly cassette: PtyCassette;
  private readonly speed: number;
  private readonly outputListeners = new Set<Listener<PtyCassetteReplayData>>();
  private readonly dataListeners = new Set<Listener<string>>();
  private readonly inputListeners = new Set<Listener<PtyCassetteReplayData>>();
  private readonly resizeListeners = new Set<
    Listener<Extract<PtyCassetteEvent, { type: "resize" }>>
  >();
  private readonly exitListeners = new Set<Listener<Extract<PtyCassetteEvent, { type: "exit" }>>>();

  private stopped = false;
  private started = false;

  constructor(cassette: PtyCassette, options: PtyCassetteReplayOptions = {}) {
    this.cassette = cassette;
    this.speed = Math.max(0, options.speed ?? 0);
  }

  onOutput(listener: Listener<PtyCassetteReplayData>): Disposable {
    this.outputListeners.add(listener);
    return disposable(this.outputListeners, listener);
  }

  onData(listener: Listener<string>): Disposable {
    this.dataListeners.add(listener);
    return disposable(this.dataListeners, listener);
  }

  onInput(listener: Listener<PtyCassetteReplayData>): Disposable {
    this.inputListeners.add(listener);
    return disposable(this.inputListeners, listener);
  }

  onResize(listener: Listener<Extract<PtyCassetteEvent, { type: "resize" }>>): Disposable {
    this.resizeListeners.add(listener);
    return disposable(this.resizeListeners, listener);
  }

  onExit(listener: Listener<Extract<PtyCassetteEvent, { type: "exit" }>>): Disposable {
    this.exitListeners.add(listener);
    return disposable(this.exitListeners, listener);
  }

  stop(): void {
    this.stopped = true;
  }

  async start(): Promise<void> {
    if (this.started) throw new Error("pty cassette replay already started");
    this.started = true;

    const outputDecoder = new TextDecoder();
    const inputDecoder = new TextDecoder();
    let lastAtMs = 0;

    for (const event of this.cassette.events) {
      if (this.stopped) break;

      if (this.speed > 0) {
        const delayMs = Math.max(0, event.atMs - lastAtMs) / this.speed;
        if (delayMs > 0) await sleep(delayMs);
      }
      lastAtMs = event.atMs;

      if (event.type === "output") {
        const data = decodeReplayData(event, outputDecoder);
        for (const listener of this.outputListeners) listener(data);
        if (data.text) {
          for (const listener of this.dataListeners) listener(data.text);
        }
        continue;
      }

      if (event.type === "input") {
        const data = decodeReplayData(event, inputDecoder);
        for (const listener of this.inputListeners) listener(data);
        continue;
      }

      if (event.type === "resize") {
        for (const listener of this.resizeListeners) listener(event);
        continue;
      }

      for (const listener of this.exitListeners) listener(event);
    }

    const tail = outputDecoder.decode();
    if (tail) {
      for (const listener of this.dataListeners) listener(tail);
    }
  }
}

export function createPtyCassetteReplay(
  cassetteOrPath: PtyCassette | string,
  options?: PtyCassetteReplayOptions,
): PtyCassetteReplay {
  const cassette =
    typeof cassetteOrPath === "string" ? readPtyCassettePath(cassetteOrPath) : cassetteOrPath;
  return new PtyCassetteReplay(cassette, options);
}

function decodeReplayData(
  event: PtyCassetteDataEvent,
  decoder: TextDecoder,
): PtyCassetteReplayData {
  const bytes = base64ToBytes(event.dataBase64);
  return {
    event,
    bytes,
    text: decoder.decode(bytes, { stream: true }),
  };
}

function disposable<T>(set: Set<Listener<T>>, listener: Listener<T>): Disposable {
  return {
    dispose: () => {
      set.delete(listener);
    },
  };
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
