import { Terminal } from "@xterm/headless";

import type { SnapshotScope } from "../terminal/snapshot";
import type { ParsedAsciicast } from "./asciicast_parse";
import { createFrameCapture, type TraceFrameCapture } from "./report_frame_capture";
import { formatStepLabel } from "./report_step_label";
import type { TraceReportFrame } from "./report_types";
import { parseResize, type TraceTermInfo } from "./term_info";

type TraceReportStepRecord = {
  index: number;
  step: { type: string; [key: string]: unknown };
  ok: boolean;
  error?: string;
  durationMs?: number;
  after?: { text: string; hash: string; kind: string };
};

export async function buildTraceReportFrames(args: {
  parsed: ParsedAsciicast;
  term: TraceTermInfo;
  scope: SnapshotScope;
  maxFrames: number;
  steps?: unknown[];
}): Promise<TraceReportFrame[]> {
  const terminal = new Terminal({
    cols: args.term.cols,
    rows: args.term.rows,
    allowProposedApi: true,
    scrollback: 2000,
    convertEol: true,
  });

  const frames: TraceReportFrame[] = [];
  const capture = createFrameCapture({
    terminal,
    frames,
    scope: args.scope,
    maxFrames: args.maxFrames,
  });
  const steps = args.steps as TraceReportStepRecord[] | undefined;

  if (steps && steps.length > 0) {
    buildStepFrames(steps, frames, args.maxFrames, capture);
  } else {
    await buildCastEventFrames(args.parsed, terminal, capture);
  }

  terminal.dispose();
  return frames;
}

function buildStepFrames(
  steps: TraceReportStepRecord[],
  frames: TraceReportFrame[],
  maxFrames: number,
  capture: TraceFrameCapture,
): void {
  for (let i = 0; i < steps.length; i += 1) {
    const stepRec = steps[i];
    if (!stepRec) continue;

    const stepLabel = formatStepLabel(stepRec.step);
    const viewText = stepRec.after?.text ?? "";
    const displayIndex = (typeof stepRec.index === "number" ? stepRec.index : i) + 1;

    const stepType = stepRec.step.type;
    const kind: TraceReportFrame["kind"] =
      stepType === "mark" ? "mark" : stepType === "resize" ? "resize" : "step";
    const markLabel =
      kind === "mark" && typeof (stepRec.step as { label?: unknown }).label === "string"
        ? String((stepRec.step as { label?: unknown }).label)
        : undefined;

    const stepParams = collectStepParams(stepRec.step);
    capture({
      atSeconds: displayIndex,
      kind,
      label: stepLabel,
      markLabel,
      stepInfo: {
        index: displayIndex,
        type: stepType,
        ok: stepRec.ok,
        error: stepRec.error,
        params: Object.keys(stepParams).length > 0 ? stepParams : undefined,
        durationMs: typeof stepRec.durationMs === "number" ? stepRec.durationMs : undefined,
      },
      overrideViewText: { text: viewText, hash: stepRec.after?.hash },
    });

    if (frames.length >= maxFrames) break;
  }
}

function collectStepParams(step: {
  type: string;
  [key: string]: unknown;
}): Record<string, unknown> {
  const stepParams: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(step)) {
    if (key !== "type") {
      stepParams[key] = value;
    }
  }
  return stepParams;
}

async function buildCastEventFrames(
  parsed: ParsedAsciicast,
  terminal: Terminal,
  capture: TraceFrameCapture,
): Promise<void> {
  let writeChain: Promise<void> = Promise.resolve();

  for (const event of parsed.events) {
    const [time, type, data] = event;
    if (type === "o") {
      writeChain = writeChain.then(() => writeTerminal(terminal, data));
    } else if (type === "r") {
      void writeChain.then(() => {
        const resized = parseResize(data);
        if (resized) {
          terminal.resize(resized.cols, resized.rows);
        }
        capture({ atSeconds: time, kind: "resize", label: `resize ${data}` });
      });
    } else if (type === "m") {
      void writeChain.then(() => {
        const markLabel = (data ?? "").trim();
        const label = markLabel ? `mark ${markLabel}` : "mark";
        capture({ atSeconds: time, kind: "mark", label, markLabel });
      });
    }
  }

  await writeChain;
  capture({
    atSeconds: parsed.events.at(-1)?.[0] ?? 0,
    kind: "final",
    label: "final",
  });
}

async function writeTerminal(terminal: Terminal, data: string): Promise<void> {
  await new Promise<void>((resolve) => {
    terminal.write(data, resolve);
  });
}
