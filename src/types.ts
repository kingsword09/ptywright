export type SessionId = string;

export type LaunchSessionArgs = {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
  name?: string;
};

export type SendTextArgs = {
  sessionId: SessionId;
  text: string;
  enter?: boolean;
};

export type PressKeyArgs = {
  sessionId: SessionId;
  key: string;
};

export type ResizeArgs = {
  sessionId: SessionId;
  cols: number;
  rows: number;
};

export type SnapshotTextArgs = {
  sessionId: SessionId;
  scope?: "visible" | "buffer";
  trimRight?: boolean;
  trimBottom?: boolean;
  maxLines?: number;
  tailLines?: number;
};

export type SnapshotGridArgs = {
  sessionId: SessionId;
  trimRight?: boolean;
};

export type WaitForTextArgs = {
  sessionId: SessionId;
  scope?: "visible" | "buffer";
  text?: string;
  regex?: string;
  timeoutMs?: number;
  intervalMs?: number;
  includeText?: boolean;
};

export type WaitForStableScreenArgs = {
  sessionId: SessionId;
  timeoutMs?: number;
  quietMs?: number;
  intervalMs?: number;
  includeText?: boolean;
};

export type CloseSessionArgs = {
  sessionId: SessionId;
};
