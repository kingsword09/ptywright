export function renderAgentReportArtifactsCss(): string {
  return `      .artifacts {
        display: grid;
        gap: 14px;
        min-width: 0;
      }
      .artifact {
        display: grid;
        gap: 12px;
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 12px;
        background: var(--panel);
        min-width: 0;
      }
      .artifact-summary {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) minmax(0, auto);
        gap: 14px;
        align-items: start;
        min-width: 0;
      }
      .artifact-meta {
        display: grid;
        gap: 4px;
        min-width: 0;
      }
      .artifact-links {
        display: flex;
        flex-wrap: wrap;
        gap: 8px 12px;
        min-width: 0;
      }
      .artifact a {
        color: var(--focus);
        font-weight: 700;
        text-decoration: none;
        overflow-wrap: anywhere;
      }
      .artifact code {
        color: var(--muted);
        overflow-wrap: anywhere;
        min-width: 0;
      }
      .artifact-hash {
        justify-self: end;
        text-align: right;
        max-width: 100%;
      }
      .badge {
        justify-self: start;
        border-radius: 999px;
        padding: 5px 9px;
        background: color-mix(in oklch, var(--line) 52%, transparent);
        color: var(--muted);
        font-size: 12px;
        font-weight: 700;
      }
      .badge.fail {
        background: color-mix(in oklch, var(--bad) 12%, var(--panel));
        color: var(--bad);
      }
      .badge.pass {
        background: color-mix(in oklch, var(--good) 12%, var(--panel));
        color: var(--good);
      }
      @media (max-width: 720px) {
        .artifact-summary {
          grid-template-columns: 1fr;
        }
        .artifact-hash {
          justify-self: start;
          text-align: left;
        }
      }`;
}
