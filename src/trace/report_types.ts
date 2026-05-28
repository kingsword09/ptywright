export type TraceReportResult = {
  ok: boolean;
  error?: string;
  failureStep?: {
    index: number;
    type: string;
  };
};

export type TraceReportArtifacts = {
  castHref?: string;
  failureErrorHref?: string;
  failureStepHref?: string;
  failureLastTextHref?: string;
  failureLastViewHref?: string;
};

export type TraceReportFrame = {
  id: string;
  atSeconds: number;
  kind: "mark" | "resize" | "final" | "step";
  markLabel?: string;
  label: string;
  viewHtml: string;
  changedCount: number;
  stepInfo?: {
    index: number;
    type: string;
    ok: boolean;
    error?: string;
    params?: Record<string, unknown>;
    durationMs?: number;
  };
  previousViewHtml?: string;
};
