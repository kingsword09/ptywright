import { escapeAttribute, escapeHtml } from "./html_escape";

// Renders a long (often absolute) path as a single non-wrapping line: a muted,
// left-truncated parent directory followed by a bright basename, with the full
// path available on hover via `title`. Replaces raw absolute-path text that
// previously wrapped across several lines and dominated the report.
export function renderPathDisplay(full: string): string {
  const normalized = full.replace(/\\/g, "/");
  const lastSep = normalized.lastIndexOf("/");
  const base = lastSep >= 0 ? normalized.slice(lastSep + 1) : normalized;
  const dir = lastSep >= 0 ? normalized.slice(0, lastSep + 1) : "";

  const dirHtml = dir ? `<span class="dir">${escapeHtml(dir)}</span>` : "";
  return `<span class="path" title="${escapeAttribute(full)}">${dirHtml}<span class="base">${escapeHtml(base || normalized)}</span></span>`;
}
