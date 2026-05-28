import { existsSync, readFileSync } from "node:fs";
import { extname } from "node:path";

import type { DocumentFormat, DocumentSource } from "./doc_parser_types";

export async function fetchDocumentContent(source: DocumentSource): Promise<string> {
  if (source.content) {
    return source.content;
  }

  if (source.type === "local" && source.path) {
    if (!existsSync(source.path)) {
      throw new Error(`File not found: ${source.path}`);
    }
    return readFileSync(source.path, "utf8");
  }

  if (source.type === "url" && source.url) {
    const response = await fetch(source.url);
    if (!response.ok) {
      throw new Error(`Failed to fetch URL: ${source.url} (${response.status})`);
    }
    return response.text();
  }

  throw new Error("Invalid document source: must provide path, url, or content");
}

export function detectDocumentFormat(source: DocumentSource, content: string): DocumentFormat {
  if (source.path) {
    const ext = extname(source.path).toLowerCase();
    if (ext === ".md" || ext === ".markdown") return "markdown";
    if (ext === ".html" || ext === ".htm") return "html";
    if (ext === ".json") return "json";
    if (ext === ".yaml" || ext === ".yml") return "yaml";
  }

  const trimmed = content.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return "json";
  if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html")) return "html";
  if (/^#\s/.test(trimmed) || /\n##\s/.test(content) || /```/.test(content)) return "markdown";

  return "text";
}
