import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, resolve } from "node:path";

import type { Browser } from "playwright";

import { launchAgentBrowser } from "./browser";
import {
  isAgentCassetteLike,
  normalizeAgentCassette,
  readAgentCassettePath,
  startAgentCassetteServer,
  type AgentCassette,
} from "./cassette";
import { sanitizeArtifactName } from "./normalize";
import { writeAgentReport } from "./report";
import { writeFlowArtifact, writeRunManifest, writeRunRecord } from "./run_artifacts";
import { readAgentRunRecordPath } from "./run_record";
import { prepareAgentRun } from "./runner_setup";
import type { AgentRunnerOptions, AgentRunResult } from "./runner_types";
import { loadAgentSpec } from "./spec_loader";
import { withTimeout } from "./timeout";
import { runAgentViewport } from "./viewport_runner";

export type {
  AgentRecordedStep,
  AgentRunArtifact,
  AgentRunMode,
  AgentRunnerOptions,
  AgentRunResult,
} from "./runner_types";
export { formatAgentLaunchPlan } from "./runner_setup";

export async function runAgentSpecPath(
  specPath: string,
  options: AgentRunnerOptions = {},
): Promise<AgentRunResult> {
  const loaded = await loadAgentSpec(specPath);
  return runAgentSpec(loaded.raw, options);
}

export async function replayAgentRecordPath(
  recordPath: string,
  options: AgentRunnerOptions = {},
): Promise<AgentRunResult> {
  const raw = JSON.parse(readFileSync(recordPath, "utf8")) as unknown;

  if (isAgentCassetteLike(raw)) {
    const cassette = normalizeAgentCassette(raw);
    return replayAgentCassette(cassette, recordPath, options);
  }

  const record = readAgentRunRecordPath(recordPath);

  if (record.cassettePath) {
    const cassettePath = isAbsolute(record.cassettePath)
      ? record.cassettePath
      : resolve(dirname(recordPath), record.cassettePath);
    const cassette = readAgentCassettePath(cassettePath, record.spec);
    return replayAgentCassette(cassette, cassettePath, {
      ...options,
      artifactsDir: options.artifactsDir ?? join(dirname(recordPath), "replay"),
    });
  }

  if (record.spec) {
    return runAgentSpec(record.spec, { ...options, config: undefined });
  }

  if (!record.flowPath) {
    throw new Error(`invalid agent run record: missing replay source in ${recordPath}`);
  }
  const flowPath = isAbsolute(record.flowPath)
    ? record.flowPath
    : resolve(dirname(recordPath), record.flowPath);
  return runAgentSpecPath(flowPath, { ...options, config: undefined });
}

export async function runAgentSpec(
  input: unknown,
  options: AgentRunnerOptions = {},
): Promise<AgentRunResult> {
  const {
    artifactsDir,
    cassette,
    cassettePath,
    flowPath,
    reportPath,
    result,
    rootDir,
    snapshotDir,
    spec,
    startedAt,
    updateSnapshots,
  } = prepareAgentRun(input, options);

  writeFlowArtifact(flowPath, spec);

  let browser: Browser | null = null;
  try {
    browser = await launchAgentBrowser({ headless: options.headless ?? true });

    for (const viewport of spec.viewports ?? []) {
      await runAgentViewport({
        browser,
        spec,
        viewport,
        rootDir,
        artifactsDir,
        snapshotDir,
        updateSnapshots,
        recordCassette: !options.replayCassette,
        cassette,
        result,
      });
    }
  } catch (error) {
    result.ok = false;
    result.errors.push(error instanceof Error ? error.message : String(error));
  } finally {
    await closeBrowserSafely(browser);
    result.durationMs = Date.now() - startedAt;
    if (options.replaySourceCassettePath) {
      writeFileSync(cassettePath, readFileSync(options.replaySourceCassettePath, "utf8"), "utf8");
    } else {
      writeFileSync(cassettePath, JSON.stringify(cassette, null, 2) + "\n", "utf8");
    }
    result.cassetteFrameCount = cassette.frames.length;
    writeRunRecord(result, spec);
    writeAgentReport(reportPath, result);
    writeRunManifest(result);
  }

  return result;
}

async function replayAgentCassette(
  cassette: AgentCassette,
  cassettePath: string,
  options: AgentRunnerOptions,
): Promise<AgentRunResult> {
  const server = await startAgentCassetteServer(cassette);
  try {
    const replaySpec = structuredClone(cassette.spec);
    const replayCassette = structuredClone(cassette);
    return await runAgentSpec(
      {
        ...replaySpec,
        launch: {
          mode: "url",
          url: withReplayViewportQuery(server.url),
          agentFlavor: replaySpec.launch.agentFlavor,
        },
      },
      {
        ...options,
        artifactsDir: options.artifactsDir ?? join(dirname(cassettePath), "replay"),
        replayCassette,
        replaySourceCassettePath: cassettePath,
      },
    );
  } finally {
    await server.close();
  }
}

function withReplayViewportQuery(url: string): string {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}viewportName={viewportName}&viewportWidth={viewportWidth}&viewportHeight={viewportHeight}`;
}

async function closeBrowserSafely(browser: Browser | null): Promise<void> {
  if (!browser) return;
  await withTimeout(
    browser.close().catch(() => undefined),
    5_000,
  );
}

export function defaultSpecNameForPath(path: string): string {
  return sanitizeArtifactName(basename(path, extname(path)));
}
