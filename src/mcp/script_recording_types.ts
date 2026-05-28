import type { Script, ScriptStep } from "../script/schema";
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

export type GoldenWrite = { path: string; text: string };

export type CheckpointConfig = {
  scope: "visible" | "buffer";
  trimRight: boolean;
  trimBottom: boolean;
  mask?: TextMaskRule[];
};

export type ScriptRecording = {
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
