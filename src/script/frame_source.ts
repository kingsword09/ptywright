import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { Script } from "./schema";
import type { ScriptBackend } from "./frame_session_types";
import { normalizeNewlines } from "./frame_text";

type FrameLike =
  | string
  | {
      name?: string;
      text?: string;
      frame?: string;
      snapshot?: string;
      lastFrame?: string;
    };

export async function resolveLaunchFrames(
  launch: Script["launch"],
  cwd: string,
  backend: Exclude<ScriptBackend, "pty">,
): Promise<string[]> {
  const frames: string[] = [];

  if (launch.frames?.length) {
    frames.push(...normalizeFrames(launch.frames));
  }

  if (launch.frame !== undefined) {
    frames.push(launch.frame);
  }

  if (launch.framePath) {
    const path = resolveLaunchPath(cwd, launch.framePath);
    frames.push(readFileSync(path, "utf8").replace(/\n$/, ""));
  }

  if (launch.frameModule) {
    frames.push(...(await loadFrameModule(resolveLaunchPath(cwd, launch.frameModule), backend)));
  }

  if (frames.length === 0) {
    throw new Error(`launch.backend=${backend} requires frame, frames, framePath, or frameModule`);
  }

  return frames;
}

async function loadFrameModule(
  modulePath: string,
  backend: Exclude<ScriptBackend, "pty">,
): Promise<string[]> {
  const mod = (await import(pathToFileURL(modulePath).href)) as Record<string, unknown>;
  const source = await materializeFrameSource(selectModuleFrameSource(mod, backend));
  return normalizeFrames(source);
}

function selectModuleFrameSource(
  mod: Record<string, unknown>,
  backend: Exclude<ScriptBackend, "pty">,
): unknown {
  if (mod.frames !== undefined) return mod.frames;
  if (mod.default !== undefined) return mod.default;
  if (backend === "ink" && mod.lastFrame !== undefined) return mod.lastFrame;
  if (backend === "ink" && mod.frame !== undefined) return mod.frame;
  if (backend === "ratatui" && mod.snapshot !== undefined) return mod.snapshot;
  if (mod.frame !== undefined) return mod.frame;
  if (mod.snapshot !== undefined) return mod.snapshot;
  throw new Error(`frame module did not export frames/default/frame/snapshot/lastFrame`);
}

async function materializeFrameSource(source: unknown): Promise<unknown> {
  if (typeof source === "function") {
    return await (source as () => unknown | Promise<unknown>)();
  }
  return source;
}

function normalizeFrames(source: unknown): string[] {
  if (Array.isArray(source)) {
    return source.map((frame) => normalizeFrame(frame));
  }
  return [normalizeFrame(source)];
}

function normalizeFrame(frame: unknown): string {
  if (typeof frame === "string") {
    return normalizeNewlines(frame).replace(/\n$/, "");
  }

  if (typeof frame === "object" && frame !== null) {
    const value = frame as FrameLike;
    const text =
      typeof value.text === "string"
        ? value.text
        : typeof value.frame === "string"
          ? value.frame
          : typeof value.snapshot === "string"
            ? value.snapshot
            : typeof value.lastFrame === "string"
              ? value.lastFrame
              : undefined;
    if (text !== undefined) {
      return normalizeNewlines(text).replace(/\n$/, "");
    }
  }

  throw new Error("frame entries must be strings or objects with text/frame/snapshot/lastFrame");
}

function resolveLaunchPath(cwd: string, path: string): string {
  return isAbsolute(path) ? path : resolve(cwd, path);
}
