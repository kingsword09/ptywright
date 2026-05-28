import { envTruthy } from "../common/env";
import type { ScriptStep } from "./schema";
import type { ScriptCustomStep } from "./runner_types";

export function formatStepLabel(step: ScriptStep): string {
  return step.type === "custom"
    ? `custom(${(step as ScriptCustomStep).name})`
    : (step as ScriptStep).type;
}

export function formatPublicStepLabel(step: ScriptStep): string {
  const showText = envTruthy(process.env.PTYWRIGHT_REPORT_SHOW_STEP_TEXT);
  if (step.type === "custom") return `custom(${(step as ScriptCustomStep).name})`;

  if (step.type === "sendText") {
    const enter = step.enter !== undefined ? ` enter=${String(step.enter)}` : "";
    if (!showText) return `sendText <redacted> (len=${step.text.length}${enter})`;
    return `sendText "${truncateInline(step.text)}"${enter ? ` (${enter.trim()})` : ""}`;
  }

  if (step.type === "pressKey") return `pressKey ${step.key}`;
  if (step.type === "sendMouse") return `sendMouse ${step.action} (${step.x},${step.y})`;
  if (step.type === "resize") return `resize ${step.cols}x${step.rows}`;
  if (step.type === "mark") return step.label ? `mark ${step.label}` : "mark";
  if (step.type === "sleep") return `sleep ${step.ms}ms`;

  if (step.type === "waitForText") {
    if (!showText)
      return step.text ? "waitForText (text)" : step.regex ? "waitForText (regex)" : "waitForText";
    if (step.text) return `waitFor "${truncateInline(step.text)}"`;
    if (step.regex) return `waitFor /${truncateInline(step.regex)}/`;
    return "waitForText";
  }

  if (step.type === "waitForStableScreen") return "waitForStableScreen";
  if (step.type === "waitForExit") return "waitForExit";
  if (step.type === "expectMeta") return "expectMeta";

  if (step.type === "snapshot") {
    return `snapshot ${step.kind}${step.saveAs ? ` as ${step.saveAs}` : ""}`;
  }

  if (step.type === "expect") {
    const parts: string[] = [];
    if (step.equals !== undefined) parts.push("equals");
    if (step.contains?.length) parts.push(`contains(${step.contains.length})`);
    if (step.notContains?.length) parts.push(`notContains(${step.notContains.length})`);
    if (step.regex) parts.push("regex");
    return parts.length ? `expect ${parts.join(",")}` : "expect";
  }

  if (step.type === "expectGolden") return `expectGolden ${step.path}`;

  if (step.type === "assert") {
    if (!showText) return step.text ? "assert (text)" : step.regex ? "assert (regex)" : "assert";
    if (step.text) return `assert "${truncateInline(step.text)}"`;
    if (step.regex) return `assert /${truncateInline(step.regex)}/`;
    if (step.description) return `assert "${truncateInline(step.description)}"`;
    return "assert";
  }

  if (step.type === "assertSemantic") return "assertSemantic";

  return assertUnreachableStep(step);
}

function truncateInline(text: string, maxChars: number = 60): string {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n/g, "\\n");
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars)}…(+${normalized.length - maxChars})`;
}

function assertUnreachableStep(_step: never): string {
  return "unknown";
}
