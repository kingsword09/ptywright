import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

import { scriptSchema } from "../script/schema";
import type { Script, ScriptStep } from "../script/schema";
import type { TerminalSession } from "../session/terminal_session";
import type { TextMaskRule } from "../terminal/mask";

export type StartScriptRecordingArgs = {
  name: string;
  outPath?: string;
  goldenDir?: string;
  overwrite?: boolean;
  checkpoint?: {
    scope?: "visible" | "buffer";
    trimRight?: boolean;
    trimBottom?: boolean;
    mask?: TextMaskRule[];
  };
};

export type StopScriptRecordingArgs = {
  recordingId: string;
  writeFiles?: boolean;
};

export type ScriptRecordingStatus = {
  recordingId: string;
  name: string;
  outPath: string;
  goldenDir: string;
  hasLaunch: boolean;
  stepCount: number;
  checkpointCount: number;
};

export type StopScriptRecordingResult = {
  scriptPath?: string;
  goldenPaths: string[];
  script: Script & { $schema?: string };
};

type GoldenWrite = { path: string; text: string };

type CheckpointConfig = {
  scope: "visible" | "buffer";
  trimRight: boolean;
  trimBottom: boolean;
  mask?: TextMaskRule[];
};

type ScriptRecording = {
  id: string;
  name: string;
  outPath: string;
  goldenDir: string;
  overwrite: boolean;
  checkpoint: CheckpointConfig;
  launch: Script["launch"] | null;
  sessionId: string | null;
  steps: ScriptStep[];
  checkpointIndex: number;
  goldenWrites: GoldenWrite[];
};

export class ScriptRecordingManager {
  private active: ScriptRecording | null = null;

  start(args: StartScriptRecordingArgs): ScriptRecordingStatus {
    if (this.active) {
      throw new Error(`recording already active: ${this.active.id}`);
    }

    const name = args.name.trim();
    if (!name) throw new Error("name is required");

    const outPath = (args.outPath?.trim() ? args.outPath.trim() : `scripts/${name}.json`).trim();
    const goldenDir = (
      args.goldenDir?.trim() ? args.goldenDir.trim() : `tests/golden/scripts/${name}`
    ).trim();

    this.active = {
      id: crypto.randomUUID(),
      name,
      outPath,
      goldenDir,
      overwrite: args.overwrite ?? false,
      checkpoint: {
        scope: args.checkpoint?.scope ?? "visible",
        trimRight: args.checkpoint?.trimRight ?? true,
        trimBottom: args.checkpoint?.trimBottom ?? true,
        mask: args.checkpoint?.mask,
      },
      launch: null,
      sessionId: null,
      steps: [],
      checkpointIndex: 0,
      goldenWrites: [],
    };

    return this.status();
  }

  stop(args: StopScriptRecordingArgs): StopScriptRecordingResult {
    if (!this.active) {
      throw new Error("no active recording");
    }
    if (args.recordingId !== this.active.id) {
      throw new Error(`recording not found: ${args.recordingId}`);
    }

    const writeFiles = args.writeFiles ?? true;
    const recording = this.active;
    this.active = null;

    if (!recording.launch) {
      throw new Error("recording has no ptywright_launch_session");
    }

    const schemaAbs = resolve("schemas/ptywright-script.schema.json");
    const schemaRel = toPosixPath(relative(dirname(resolve(recording.outPath)), schemaAbs));

    const built: Script & { $schema?: string } = {
      $schema: schemaRel,
      name: recording.name,
      launch: recording.launch,
      steps: recording.steps,
    };

    const parsed = scriptSchema.parse(built) as Script;
    const script = { ...parsed, $schema: built.$schema };

    const goldenPaths = recording.goldenWrites.map((w) => w.path);

    if (writeFiles) {
      writeOrThrow(recording.outPath, `${JSON.stringify(script, null, 2)}\n`, recording.overwrite);

      for (const w of recording.goldenWrites) {
        writeOrThrow(w.path, `${w.text}\n`, recording.overwrite);
      }
    }

    return { scriptPath: writeFiles ? recording.outPath : undefined, goldenPaths, script };
  }

  status(): ScriptRecordingStatus {
    if (!this.active) {
      throw new Error("no active recording");
    }
    return {
      recordingId: this.active.id,
      name: this.active.name,
      outPath: this.active.outPath,
      goldenDir: this.active.goldenDir,
      hasLaunch: this.active.launch !== null,
      stepCount: this.active.steps.length,
      checkpointCount: this.active.checkpointIndex,
    };
  }

  recordLaunch(args: Script["launch"], sessionId: string): void {
    const rec = this.active;
    if (!rec) return;

    if (rec.launch) return;
    rec.launch = args;
    rec.sessionId = sessionId;
  }

  recordStep(step: ScriptStep): void {
    const rec = this.active;
    if (!rec) return;
    rec.steps.push(step);
  }

  async recordCheckpoint(args: { session: TerminalSession; label?: string }): Promise<void> {
    const rec = this.active;
    if (!rec) return;
    if (!rec.sessionId || rec.sessionId !== args.session.id) return;

    const label = (args.label ?? "").trim();
    const safe = sanitizeLabel(label || `checkpoint_${rec.checkpointIndex + 1}`);
    rec.checkpointIndex += 1;

    const snapshot = await args.session.snapshotText({
      scope: rec.checkpoint.scope,
      trimRight: rec.checkpoint.trimRight,
      trimBottom: rec.checkpoint.trimBottom,
      captureFrame: true,
      mask: rec.checkpoint.mask,
    });

    const goldenPath = toPosixPath(resolvePathLike(joinPosix(rec.goldenDir, `${safe}.txt`), false));
    rec.goldenWrites.push({ path: goldenPath, text: snapshot.text });

    rec.steps.push({
      type: "snapshot",
      kind: "text",
      scope: rec.checkpoint.scope,
      trimRight: rec.checkpoint.trimRight,
      trimBottom: rec.checkpoint.trimBottom,
      mask: rec.checkpoint.mask,
    } as Extract<ScriptStep, { type: "snapshot" }>);

    rec.steps.push({
      type: "expectGolden",
      path: goldenPath,
    } as Extract<ScriptStep, { type: "expectGolden" }>);
  }
}

function writeOrThrow(path: string, text: string, overwrite: boolean): void {
  const abs = resolvePathLike(path, true);
  if (!overwrite && existsSync(abs)) {
    throw new Error(`refusing to overwrite: ${path}`);
  }
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, text, "utf8");
}

function resolvePathLike(path: string, absolute: boolean): string {
  if (!absolute) return toPosixPath(path);
  return resolve(process.cwd(), path);
}

function sanitizeLabel(label: string): string {
  return label.replace(/[^a-z0-9._-]+/gi, "_").replace(/^_+|_+$/g, "") || "checkpoint";
}

function toPosixPath(path: string): string {
  return path.replace(/\\/g, "/");
}

function joinPosix(a: string, b: string): string {
  const left = a.replace(/\\/g, "/").replace(/\/+$/g, "");
  const right = b.replace(/\\/g, "/").replace(/^\/+/g, "");
  return `${left}/${right}`;
}
