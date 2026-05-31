// A tiny inline clipboard helper shared by the overview and per-entry reports.
// Buttons opt in with `data-copy="<text>"`; on click the text is copied and the
// button briefly shows a check. Kept dependency-free and defensive so it is a
// no-op in environments without the async clipboard API.
import { escapeAttribute, escapeHtml } from "./html_escape";

export function renderReportCopyScript(): string {
  return `<script>
    (function () {
      function flash(btn) {
        var prev = btn.textContent;
        btn.textContent = "\\u2713";
        btn.classList.add("copied");
        setTimeout(function () {
          btn.textContent = prev;
          btn.classList.remove("copied");
        }, 1100);
      }
      document.addEventListener("click", function (event) {
        var btn = event.target && event.target.closest ? event.target.closest("[data-copy]") : null;
        if (!btn) return;
        var text = btn.getAttribute("data-copy") || "";
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () { flash(btn); }).catch(function () {});
        }
      });
    })();
  </script>`;
}

// A copyable command block: an uppercase label, the command text, and a copy
// button wired to the shared script above.
export function renderCopyableCommand(label: string, command: string): string {
  return `<div class="codeblock">
        <span class="lbl">${escapeHtml(label)}</span>
        <button class="copybtn" type="button" data-copy="${escapeAttribute(command)}" aria-label="copy ${escapeAttribute(label)}">⧉</button>
        <pre>${escapeHtml(command)}</pre>
      </div>`;
}
