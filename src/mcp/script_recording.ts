import { dirname, relative, resolve } from "node:path";

import { scriptSchema } from "../script/schema";
import type { Script, ScriptStep } from "../script/schema";
import type { TerminalSession } from "../session/terminal_session";
import {
  joinPosix,
  resolvePathLike,
  sanitizeLabel,
  toPosixPath,
  writeOrThrow,
} from "./script_recording_files";
import type {
  ScriptRecording,
  ScriptRecordingStatus,
  StartScriptRecordingArgs,
  StopScriptRecordingArgs,
  StopScriptRecordingResult,
} from "./script_recording_types";
export type {
  ScriptRecordingStatus,
  StartScriptRecordingArgs,
  StopScriptRecordingArgs,
  StopScriptRecordingResult,
} from "./script_recording_types";

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
      throw new Error("recording has no launch_session");
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
