export function renderAgentReportArtifactsCss(): string {
  return `      /* Viewport grouping */
      .viewport-group {
        margin-bottom: 32px;
        min-width: 0;
      }
      .viewport-group:last-child {
        margin-bottom: 0;
      }
      .viewport-title {
        margin: 0 0 16px;
        font-size: 18px;
        font-weight: 660;
        color: var(--ink);
        padding-bottom: 10px;
        border-bottom: 2px solid var(--line);
        overflow-wrap: break-word;
        word-break: break-word;
      }
      .viewport-artifacts {
        display: grid;
        gap: 16px;
        min-width: 0;
      }

      /* Artifact group (by name: status, ready, etc.) */
      .artifact-group {
        border: 1px solid var(--line);
        border-radius: var(--radius);
        background: var(--panel);
        overflow: hidden;
        box-shadow: var(--shadow);
        min-width: 0;
      }
      .artifact-group-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 14px 16px;
        background: var(--raised);
        border-bottom: 1px solid var(--line);
        min-width: 0;
      }
      .artifact-name {
        font-weight: 640;
        font-size: 14px;
        color: var(--ink);
        font-family: var(--font-mono);
        overflow-wrap: break-word;
        word-break: break-word;
        min-width: 0;
      }
      .artifact-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        flex-shrink: 0;
      }
      .artifact-chip {
        display: inline-flex;
        align-items: center;
        padding: 4px 10px;
        border-radius: var(--radius-xs);
        font-size: 11px;
        font-weight: 640;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        text-decoration: none;
        transition: all 0.12s ease;
        border: 1px solid var(--line);
        background: var(--panel);
        color: var(--muted);
        white-space: nowrap;
      }
      .artifact-chip.pass {
        border-color: var(--pass);
        background: var(--pass-soft);
        color: var(--pass);
      }
      .artifact-chip.fail {
        border-color: var(--fail);
        background: var(--fail-soft);
        color: var(--fail);
      }
      .artifact-chip:hover {
        transform: translateY(-1px);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      }

      /* Artifact detail (for failed artifacts) */
      .artifact-detail {
        padding: 16px;
        min-width: 0;
      }
      .artifact-comparison {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
        gap: 20px;
        margin-bottom: 16px;
        min-width: 0;
      }
      .artifact-preview {
        display: flex;
        flex-direction: column;
        gap: 10px;
        min-width: 0;
      }
      .artifact-preview-label {
        font-size: 12px;
        font-weight: 640;
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        overflow-wrap: break-word;
      }

      /* Device frame for DOM/screenshot previews */
      .device-frame {
        position: relative;
        border: 1px solid var(--line);
        border-radius: var(--radius-sm);
        background: var(--canvas);
        overflow: hidden;
        box-shadow: var(--shadow);
        aspect-ratio: 3 / 4;
        max-height: 600px;
        min-width: 0;
      }
      .device-frame.failed {
        border-color: var(--fail);
        box-shadow: 0 0 0 2px var(--fail-soft);
      }
      .device-frame.diff {
        border-color: var(--changed);
        box-shadow: 0 0 0 2px var(--changed-soft);
      }
      .device-frame iframe {
        width: 100%;
        height: 100%;
        border: 0;
        display: block;
      }

      /* Artifact error message */
      .artifact-error {
        padding: 12px;
        background: var(--fail-soft);
        border: 1px solid color-mix(in oklab, var(--fail) 25%, var(--line));
        border-radius: var(--radius-xs);
        color: var(--fail);
        font-size: 13px;
        margin-bottom: 12px;
        overflow-wrap: break-word;
        word-break: break-word;
        min-width: 0;
      }
      .artifact-error strong {
        font-weight: 660;
      }

      /* Artifact metadata row */
      .artifact-meta-row {
        display: flex;
        justify-content: flex-end;
        padding-top: 12px;
        border-top: 1px solid var(--line);
        min-width: 0;
      }
      .artifact-hash {
        font-family: var(--font-mono);
        font-size: 11px;
        color: var(--faint);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 100%;
        min-width: 0;
      }

      /* Artifact links (for non-visual artifacts) */
      .artifact-links {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 12px;
        min-width: 0;
      }

      /* Responsive adjustments */
      @media (max-width: 720px) {
        .artifact-comparison {
          grid-template-columns: 1fr;
        }
        .artifact-group-header {
          flex-direction: column;
          align-items: flex-start;
        }
        .device-frame {
          max-height: 500px;
        }
      }`;
}
