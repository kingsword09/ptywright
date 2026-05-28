import { envTruthy } from "../common/env";

export function formatStepLabel(step: { type: string; [key: string]: unknown }): string {
  const showText = envTruthy(process.env.PTYWRIGHT_REPORT_SHOW_STEP_TEXT);

  if (step.type === "custom" && typeof step.name === "string") return `custom(${step.name})`;

  if (step.type === "sendText") {
    const enter = typeof step.enter === "boolean" ? step.enter : undefined;
    const enterSuffix = enter !== undefined ? `enter=${enter}` : "";
    const description = typeof step.description === "string" ? step.description : "";
    const text = typeof step.text === "string" ? step.text : description;

    if (!text) {
      return enterSuffix ? `sendText (${enterSuffix})` : "sendText";
    }

    if (!showText) {
      return `sendText <redacted> (len=${text.length}${enterSuffix ? `, ${enterSuffix}` : ""})`;
    }

    return `sendText "${truncateInline(text)}"${enterSuffix ? ` (${enterSuffix})` : ""}`;
  }

  if (step.type === "waitForText") {
    const text = typeof step.text === "string" ? step.text : undefined;
    const regex = typeof step.regex === "string" ? step.regex : undefined;
    const description = typeof step.description === "string" ? step.description : undefined;

    if (!showText) {
      if (text) return "waitForText (text)";
      if (regex) return "waitForText (regex)";
      return "waitForText";
    }

    if (text) return `waitFor "${truncateInline(text)}"`;
    if (regex) return `waitFor /${truncateInline(regex)}/`;
    if (description) return `waitForText "${truncateInline(description)}"`;
    return "waitForText";
  }

  if (step.type === "assert") {
    const text = typeof step.text === "string" ? step.text : undefined;
    const regex = typeof step.regex === "string" ? step.regex : undefined;
    const description = typeof step.description === "string" ? step.description : undefined;

    if (!showText) {
      if (text) return "assert (text)";
      if (regex) return "assert (regex)";
      return "assert";
    }

    if (text) return `assert "${truncateInline(text)}"`;
    if (regex) return `assert /${truncateInline(regex)}/`;
    if (description) return `assert "${truncateInline(description)}"`;
    return "assert";
  }

  if (step.type === "pressKey" && typeof step.key === "string") return `pressKey ${step.key}`;

  if (step.type === "mark") {
    const label = typeof step.label === "string" ? step.label.trim() : "";
    return label ? `mark ${label}` : "mark";
  }

  if (step.type === "resize") {
    const cols = typeof step.cols === "number" ? step.cols : undefined;
    const rows = typeof step.rows === "number" ? step.rows : undefined;
    if (cols !== undefined && rows !== undefined) return `resize ${cols}x${rows}`;
    return "resize";
  }

  return step.type;
}

function truncateInline(text: string, maxChars: number = 60): string {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n/g, "\\n");
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars)}…(+${normalized.length - maxChars})`;
}
