export type PtySpawnOptions = {
  cols: number;
  rows: number;
  cwd: string;
  env: Record<string, string>;
  name: string;
};

export type PtyExitEvent = {
  exitCode: number;
  signal?: number | string;
};

export type Disposable = {
  dispose(): void;
};

export type PtyProcess = {
  readonly pid: number;
  readonly cols: number;
  readonly rows: number;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
  onData(listener: (data: string) => void): Disposable;
  onExit(listener: (event: PtyExitEvent) => void): Disposable;
};

export type PtyAdapter = {
  spawn(command: string, args: string[], options: PtySpawnOptions): PtyProcess;
};
