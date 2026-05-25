import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "bun:test";

import {
  createPtyCassetteRecorder,
  createPtyCassetteReplay,
  readPtyCassettePath,
  validatePtyCassette,
  wrapBunTerminalOptions,
  wrapPtyLike,
  writePtyCassettePath,
  type DisposableLike,
  type PtyCassetteData,
  type PtyLike,
} from "../src/pty-cassette";
import type { PtyExitEvent } from "../src/pty/pty_adapter";

class FakePty implements PtyLike {
  readonly dataListeners = new Set<(data: PtyCassetteData) => void>();
  readonly exitListeners = new Set<(event: PtyExitEvent) => void>();
  written = "";
  resized: Array<[number, number]> = [];
  killed = false;

  write(data: PtyCassetteData): void {
    this.written += typeof data === "string" ? data : Buffer.from(data).toString("utf8");
  }

  resize(cols: number, rows: number): void {
    this.resized.push([cols, rows]);
  }

  kill(): void {
    this.killed = true;
  }

  onData(listener: (data: PtyCassetteData) => void): DisposableLike {
    this.dataListeners.add(listener);
    return {
      dispose: () => {
        this.dataListeners.delete(listener);
      },
    };
  }

  onExit(listener: (event: PtyExitEvent) => void): DisposableLike {
    this.exitListeners.add(listener);
    return {
      dispose: () => {
        this.exitListeners.delete(listener);
      },
    };
  }

  emitData(data: PtyCassetteData): void {
    for (const listener of this.dataListeners) listener(data);
  }

  emitExit(event: PtyExitEvent): void {
    for (const listener of this.exitListeners) listener(event);
  }
}

test("recorder writes a validated raw PTY cassette and replay emits output", async () => {
  const dir = join(".tmp", "tests", "pty-cassette");
  const path = join(dir, "manual.pty.json");
  rmSync(dir, { recursive: true, force: true });

  const recorder = createPtyCassetteRecorder({
    terminal: { cols: 80, rows: 24, term: "xterm-256color" },
    command: { file: "demo", args: ["--flag"], cwd: "/tmp" },
  });
  recorder.recordOutput("READY\n");
  recorder.recordInput("hello\r");
  recorder.recordResize(100, 30);
  recorder.recordExit({ exitCode: 0 });

  writePtyCassettePath(path, recorder.stop());

  expect(existsSync(path)).toBe(true);
  const cassette = readPtyCassettePath(path);
  expect(validatePtyCassette(cassette).ok).toBe(true);
  expect(cassette.events.map((event) => event.type)).toEqual(["output", "input", "resize", "exit"]);

  let text = "";
  const resizes: Array<[number, number]> = [];
  let exitCode: number | null = null;
  const replay = createPtyCassetteReplay(cassette, { speed: 0 });
  replay.onData((chunk) => {
    text += chunk;
  });
  replay.onResize((event) => {
    resizes.push([event.cols, event.rows]);
  });
  replay.onExit((event) => {
    exitCode = event.exitCode;
  });
  await replay.start();

  expect(text).toBe("READY\n");
  expect(resizes).toEqual([[100, 30]]);
  expect(exitCode).toBe(0);

  const raw = JSON.parse(readFileSync(path, "utf8")) as { events: Array<{ dataBase64?: string }> };
  expect(raw.events[0]?.dataBase64).toBe(Buffer.from("READY\n").toString("base64"));
});

test("wrapPtyLike records node-pty and bun-pty style objects without app coupling", () => {
  const fake = new FakePty();
  const wrapped = wrapPtyLike(fake, {
    terminal: { cols: 40, rows: 8, term: "xterm-256color" },
    command: { file: "node-pty-like", args: [] },
  });

  fake.emitData("READY\n");
  wrapped.write("hello\r");
  wrapped.resize(42, 9);
  fake.emitExit({ exitCode: 0 });

  const cassette = wrapped.stopRecording();
  expect(fake.written).toBe("hello\r");
  expect(fake.resized).toEqual([[42, 9]]);
  expect(cassette.events.map((event) => event.type)).toEqual(["output", "input", "resize", "exit"]);

  wrapped.dispose();
  fake.emitData("IGNORED");
  expect(wrapped.stopRecording().events).toHaveLength(4);
});

test("Bun Terminal helper records callback-style terminal output", () => {
  const recorder = createPtyCassetteRecorder({
    terminal: { cols: 20, rows: 5 },
  });
  const seen: Uint8Array[] = [];
  const options = wrapBunTerminalOptions(
    {
      cols: 20,
      rows: 5,
      data: (_terminal, data) => {
        seen.push(data);
      },
    },
    recorder,
  );

  options.data?.({} as never, Buffer.from("BT"));

  const cassette = recorder.stop();
  expect(seen.map((chunk) => Buffer.from(chunk).toString("utf8"))).toEqual(["BT"]);
  expect(cassette.events).toHaveLength(1);
  expect(cassette.events[0]).toMatchObject({ type: "output" });
});
