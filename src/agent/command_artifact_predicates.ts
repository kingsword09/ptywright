export function isReplaySummaryLike(input: unknown): boolean {
  return (
    typeof input === "object" &&
    input !== null &&
    Array.isArray((input as { entries?: unknown }).entries) &&
    "totalCount" in input &&
    "failureCount" in input
  );
}

export function isPromoteSummaryLike(input: unknown): boolean {
  return (
    typeof input === "object" &&
    input !== null &&
    "targetCassettePath" in input &&
    "validation" in input &&
    "replay" in input &&
    Array.isArray((input as { failures?: unknown }).failures)
  );
}

export function isCheckSummaryLike(input: unknown): boolean {
  return (
    typeof input === "object" &&
    input !== null &&
    "inputs" in input &&
    "outputs" in input &&
    "replay" in input &&
    Array.isArray((input as { failures?: unknown }).failures)
  );
}

export function isAgentFlowLike(input: unknown): boolean {
  return (
    typeof input === "object" &&
    input !== null &&
    "launch" in input &&
    Array.isArray((input as { steps?: unknown }).steps)
  );
}
