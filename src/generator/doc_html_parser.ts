import type { CodeBlock, ParsedDocument } from "./doc_parser_types";
import { isLikelyStep } from "./doc_step_detection";

export function parseHtml(content: string): ParsedDocument {
  const codeBlocks: CodeBlock[] = [];
  const steps: string[] = [];
  let title: string | undefined;

  const titleMatch = content.match(/<title>([^<]+)<\/title>/i);
  if (titleMatch && titleMatch[1]) {
    title = titleMatch[1].trim();
  }

  const codeRegex = /<code[^>]*(?:class="[^"]*language-(\w+)[^"]*")?[^>]*>([\s\S]*?)<\/code>/gi;
  let match;
  while ((match = codeRegex.exec(content)) !== null) {
    const lang = match[1] ?? "text";
    const code = decodeHtmlEntities(match[2] ?? "");
    if (code.trim()) {
      codeBlocks.push({
        language: lang,
        code: code.trim(),
        lineNumber: 0,
      });
    }
  }

  const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  while ((match = liRegex.exec(content)) !== null) {
    const text = stripHtmlTags(match[1] ?? "").trim();
    if (text && isLikelyStep(text)) {
      steps.push(text);
    }
  }

  return {
    title,
    codeBlocks,
    steps,
    rawContent: content,
    format: "html",
  };
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]+>/g, "");
}
