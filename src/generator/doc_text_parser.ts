import type { ParsedDocument } from "./doc_parser_types";
import { isLikelyStep } from "./doc_step_detection";

export function parsePlainText(content: string): ParsedDocument {
  const lines = content.split("\n");
  const steps: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const numberedMatch = trimmed.match(/^\d+\.\s+(.+)$/);
    if (numberedMatch && numberedMatch[1]) {
      steps.push(numberedMatch[1].trim());
      continue;
    }

    const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (bulletMatch && bulletMatch[1]) {
      steps.push(bulletMatch[1].trim());
      continue;
    }

    if (isLikelyStep(trimmed)) {
      steps.push(trimmed);
    }
  }

  return {
    codeBlocks: [],
    steps,
    rawContent: content,
    format: "text",
  };
}
