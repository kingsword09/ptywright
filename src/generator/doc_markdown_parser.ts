import type { CodeBlock, ParsedDocument } from "./doc_parser_types";
import { isLikelyStep } from "./doc_step_detection";

export function parseMarkdown(content: string): ParsedDocument {
  const lines = content.split("\n");
  const codeBlocks: CodeBlock[] = [];
  const steps: string[] = [];
  let title: string | undefined;
  let description: string | undefined;

  let inCodeBlock = false;
  let currentLang = "";
  let currentCode: string[] = [];
  let codeBlockStart = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";

    if (!title && /^#\s+(.+)$/.test(line)) {
      title = line.replace(/^#\s+/, "").trim();
      continue;
    }

    if (title && !description && !inCodeBlock && line.trim() && !/^[#-]/.test(line)) {
      description = line.trim();
    }

    if (line.startsWith("```")) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        currentLang = line.slice(3).trim().toLowerCase();
        currentCode = [];
        codeBlockStart = i + 1;
      } else {
        inCodeBlock = false;
        if (currentCode.length > 0) {
          codeBlocks.push({
            language: currentLang || "text",
            code: currentCode.join("\n"),
            lineNumber: codeBlockStart,
          });
        }
      }
      continue;
    }

    if (inCodeBlock) {
      currentCode.push(line);
      continue;
    }

    const stepMatch = line.match(/^\s*(\d+)\.\s+(.+)$/);
    if (stepMatch && stepMatch[2]) {
      steps.push(stepMatch[2].trim());
    }

    const bulletMatch = line.match(/^\s*[-*]\s+(.+)$/);
    if (bulletMatch && bulletMatch[1]) {
      const text = bulletMatch[1].trim();
      if (isLikelyStep(text)) {
        steps.push(text);
      }
    }
  }

  return {
    title,
    description,
    codeBlocks,
    steps,
    rawContent: content,
    format: "markdown",
  };
}
