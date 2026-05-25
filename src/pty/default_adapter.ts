import { BunPtyAdapter } from "./bun_pty_adapter";
import { BunTerminalAdapter } from "./bun_terminal_adapter";
import type { PtyAdapter } from "./pty_adapter";

export type PtyBackend = "auto" | "bun-terminal" | "bun-pty";

export function resolvePtyBackend(value: string | undefined): PtyBackend {
  const backend = (value ?? process.env.TUI_TEST_PTY_BACKEND ?? "auto").toLowerCase();
  if (backend === "auto" || backend === "bun-terminal" || backend === "bun-pty") {
    return backend;
  }
  throw new Error(`unknown PTY backend: ${value ?? ""}`);
}

export function createDefaultPtyAdapter(value?: string): PtyAdapter {
  const backend = resolvePtyBackend(value);

  if (backend === "bun-pty") return new BunPtyAdapter();
  if (backend === "bun-terminal") return new BunTerminalAdapter();

  return process.platform === "win32" ? new BunPtyAdapter() : new BunTerminalAdapter();
}
