import { BunPtyAdapter } from "../pty/bun_pty_adapter";
import type { PtyAdapter } from "../pty/pty_adapter";
import { TerminalSession } from "./terminal_session";

import type { LaunchSessionArgs, SessionId } from "../types";

export type SessionManagerOptions = {
  ptyAdapter?: PtyAdapter;
  snapshotRingSize?: number;
};

export class SessionManager {
  private readonly ptyAdapter: PtyAdapter;
  private readonly snapshotRingSize: number;
  private readonly sessions = new Map<SessionId, TerminalSession>();

  constructor(options?: SessionManagerOptions) {
    this.ptyAdapter = options?.ptyAdapter ?? new BunPtyAdapter();
    this.snapshotRingSize = options?.snapshotRingSize ?? 50;
  }

  listSessionIds(): SessionId[] {
    return [...this.sessions.keys()];
  }

  getSession(sessionId: SessionId): TerminalSession | undefined {
    return this.sessions.get(sessionId);
  }

  launchSession(args: LaunchSessionArgs): TerminalSession {
    const sessionId = crypto.randomUUID();
    const cols = clampInt(args.cols ?? 80, 1, 500);
    const rows = clampInt(args.rows ?? 24, 1, 300);
    const cwd = args.cwd ?? process.cwd();
    const name = args.name ?? "xterm-256color";

    const env = mergeEnv(
      {
        TERM: name,
        COLORTERM: "truecolor",
      },
      args.env,
    );

    const pty = this.ptyAdapter.spawn(args.command, args.args ?? [], {
      cols,
      rows,
      cwd,
      name,
      env,
    });

    const session = new TerminalSession({
      id: sessionId,
      pty,
      cols,
      rows,
      snapshotRingSize: this.snapshotRingSize,
    });

    this.sessions.set(sessionId, session);
    return session;
  }

  closeSession(sessionId: SessionId): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    session.close();
    this.sessions.delete(sessionId);
    return true;
  }

  closeAll(): void {
    for (const [id, session] of this.sessions) {
      session.close();
      this.sessions.delete(id);
    }
  }
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  const int = Math.trunc(value);
  if (int < min) return min;
  if (int > max) return max;
  return int;
}

function mergeEnv(
  base: Record<string, string>,
  override?: Record<string, string>,
): Record<string, string> {
  const env: Record<string, string> = {};

  for (const [k, v] of Object.entries(process.env)) {
    if (typeof v === "string") {
      env[k] = v;
    }
  }

  for (const [k, v] of Object.entries(base)) {
    env[k] = v;
  }

  if (override) {
    for (const [k, v] of Object.entries(override)) {
      env[k] = v;
    }
  }

  return env;
}
