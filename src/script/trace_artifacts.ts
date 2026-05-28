import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { relativeHref } from "../common/path";
import { ensureAsciinemaPlayerAssets } from "../trace/asciinema_player_assets";
import { generateTraceReportHtml } from "../trace/report";
import type { TraceReportArtifacts, TraceReportResult } from "../trace/report";
import type { ScriptSession } from "./frame_session_types";

export async function writeTraceArtifacts(args: {
  session: ScriptSession;
  artifactsDir: string;
  saveCast: boolean;
  castPath: string;
  saveReport: boolean;
  reportPath: string;
  reportScope?: "visible" | "buffer";
  reportMaxFrames?: number;
  scriptName?: string;
  result?: TraceReportResult;
  executionSteps?: unknown[];
}): Promise<void> {
  if (!args.saveCast && !args.saveReport) return;

  const snapshot = await args.session.snapshotCast();

  if (args.saveCast) {
    mkdirSync(dirname(args.castPath), { recursive: true });
    writeFileSync(args.castPath, snapshot.cast, "utf8");
  }

  if (args.saveReport) {
    const artifactHrefs = buildReportArtifactHrefs({
      reportPath: args.reportPath,
      castPath: args.saveCast ? args.castPath : null,
      artifactsDir: args.artifactsDir,
      includeFailures: args.result?.ok === false,
    });

    const html = await generateTraceReportHtml(snapshot.cast, {
      scope: args.reportScope,
      maxFrames: args.reportMaxFrames,
      scriptName: args.scriptName,
      result: args.result,
      artifacts: artifactHrefs,
      steps: args.executionSteps,
    });
    mkdirSync(dirname(args.reportPath), { recursive: true });
    writeFileSync(args.reportPath, html, "utf8");
    ensureAsciinemaPlayerAssets(args.reportPath);
  }
}

function buildReportArtifactHrefs(args: {
  reportPath: string;
  castPath: string | null;
  artifactsDir: string;
  includeFailures: boolean;
}): TraceReportArtifacts | undefined {
  const items: TraceReportArtifacts = {};

  if (args.castPath) {
    items.castHref = relativeHref(args.reportPath, args.castPath);
  }

  if (args.includeFailures) {
    items.failureErrorHref = relativeHref(
      args.reportPath,
      join(args.artifactsDir, "failure.error.txt"),
    );
    items.failureStepHref = relativeHref(
      args.reportPath,
      join(args.artifactsDir, "failure.step.json"),
    );
    items.failureLastTextHref = relativeHref(
      args.reportPath,
      join(args.artifactsDir, "failure.last.txt"),
    );
    items.failureLastViewHref = relativeHref(
      args.reportPath,
      join(args.artifactsDir, "failure.last.view.txt"),
    );
  }

  return Object.keys(items).length ? items : undefined;
}
