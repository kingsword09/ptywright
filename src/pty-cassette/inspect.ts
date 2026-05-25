import { base64ToBytes } from "./data";
import { readPtyCassettePath } from "./io";
import type { PtyCassette } from "./schema";

export type PtyCassetteInspection = {
  version: number;
  path?: string;
  createdAt: string;
  durationMs: number;
  terminal: PtyCassette["terminal"];
  command?: PtyCassette["command"];
  eventCount: number;
  outputCount: number;
  inputCount: number;
  resizeCount: number;
  exitCount: number;
  outputBytes: number;
  inputBytes: number;
};

export function inspectPtyCassette(cassette: PtyCassette, path?: string): PtyCassetteInspection {
  let outputCount = 0;
  let inputCount = 0;
  let resizeCount = 0;
  let exitCount = 0;
  let outputBytes = 0;
  let inputBytes = 0;

  for (const event of cassette.events) {
    if (event.type === "output") {
      outputCount += 1;
      outputBytes += base64ToBytes(event.dataBase64).byteLength;
    } else if (event.type === "input") {
      inputCount += 1;
      inputBytes += base64ToBytes(event.dataBase64).byteLength;
    } else if (event.type === "resize") {
      resizeCount += 1;
    } else {
      exitCount += 1;
    }
  }

  return {
    version: cassette.version,
    path,
    createdAt: cassette.createdAt,
    durationMs: cassette.durationMs,
    terminal: cassette.terminal,
    command: cassette.command,
    eventCount: cassette.events.length,
    outputCount,
    inputCount,
    resizeCount,
    exitCount,
    outputBytes,
    inputBytes,
  };
}

export function inspectPtyCassettePath(path: string): PtyCassetteInspection {
  return inspectPtyCassette(readPtyCassettePath(path), path);
}

export function formatPtyCassetteInspectLines(result: PtyCassetteInspection): string[] {
  const command = result.command
    ? [result.command.file, ...(result.command.args ?? [])].join(" ")
    : null;

  return [
    "ok pty-cassette",
    result.path ? `path=${result.path}` : "",
    `version=${result.version}`,
    `createdAt=${result.createdAt}`,
    `durationMs=${result.durationMs}`,
    `terminal=${result.terminal.cols}x${result.terminal.rows}`,
    result.terminal.term ? `term=${result.terminal.term}` : "",
    command ? `command=${command}` : "",
    `events=${result.eventCount}`,
    `output=${result.outputCount} chunks/${result.outputBytes} bytes`,
    `input=${result.inputCount} chunks/${result.inputBytes} bytes`,
    `resize=${result.resizeCount}`,
    `exit=${result.exitCount}`,
  ].filter(Boolean);
}
