import { readFileSync, existsSync } from "node:fs";
import { extname } from "node:path";

export type DocumentSource = {
  type: "local" | "url" | "raw";
  path?: string;
  url?: string;
  content?: string;
};

export type CodeBlock = {
  language: string;
  code: string;
  lineNumber: number;
};

export type ParsedDocument = {
  title?: string;
  description?: string;
  codeBlocks: CodeBlock[];
  steps: string[];
  rawContent: string;
  format: "markdown" | "html" | "json" | "yaml" | "text";
};

export async function parseDocument(source: DocumentSource): Promise<ParsedDocument> {
  const content = await fetchContent(source);
  const format = detectFormat(source, content);

  switch (format) {
    case "markdown":
      return parseMarkdown(content);
    case "json":
      return parseJson(content);
    case "yaml":
      return parseYaml(content);
    case "html":
      return parseHtml(content);
    default:
      return parsePlainText(content);
  }
}

async function fetchContent(source: DocumentSource): Promise<string> {
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

function detectFormat(
  source: DocumentSource,
  content: string,
): "markdown" | "html" | "json" | "yaml" | "text" {
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

function parseMarkdown(content: string): ParsedDocument {
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

    // Extract title from first h1
    if (!title && /^#\s+(.+)$/.test(line)) {
      title = line.replace(/^#\s+/, "").trim();
      continue;
    }

    // Extract description from first paragraph after title
    if (title && !description && !inCodeBlock && line.trim() && !/^[#-]/.test(line)) {
      description = line.trim();
    }

    // Handle code blocks
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

    // Extract numbered steps
    const stepMatch = line.match(/^\s*(\d+)\.\s+(.+)$/);
    if (stepMatch && stepMatch[2]) {
      steps.push(stepMatch[2].trim());
    }

    // Extract bullet points that look like steps
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

function parseJson(content: string): ParsedDocument {
  const parsed = JSON.parse(content) as unknown;
  const codeBlocks: CodeBlock[] = [];
  const steps: string[] = [];

  if (typeof parsed === "object" && parsed !== null) {
    const obj = parsed as Record<string, unknown>;

    // Check if it's a ptywright script format
    if ("launch" in obj && "steps" in obj) {
      return {
        title: (obj.name as string) ?? "Imported Script",
        description: "Parsed from JSON script",
        codeBlocks: [],
        steps: [],
        rawContent: content,
        format: "json",
      };
    }

    // Extract commands from various JSON structures
    if (Array.isArray(obj.commands)) {
      for (const cmd of obj.commands) {
        if (typeof cmd === "string") steps.push(cmd);
        else if (typeof cmd === "object" && cmd && "command" in cmd) {
          steps.push(String((cmd as Record<string, unknown>).command));
        }
      }
    }

    if (Array.isArray(obj.steps)) {
      for (const step of obj.steps) {
        if (typeof step === "string") steps.push(step);
        else if (typeof step === "object" && step) {
          const s = step as Record<string, unknown>;
          if (typeof s.description === "string") steps.push(s.description);
          else if (typeof s.command === "string") steps.push(s.command);
        }
      }
    }
  }

  return {
    codeBlocks,
    steps,
    rawContent: content,
    format: "json",
  };
}

function parseYaml(content: string): ParsedDocument {
  // Simple YAML parsing for common patterns
  const steps: string[] = [];
  const lines = content.split("\n");

  for (const line of lines) {
    // Match YAML list items
    const match = line.match(/^\s*-\s+(.+)$/);
    if (match && match[1]) {
      const value = match[1].trim();
      if (!value.startsWith("{") && !value.includes(":")) {
        steps.push(value);
      }
    }
  }

  return {
    codeBlocks: [],
    steps,
    rawContent: content,
    format: "yaml",
  };
}

function parseHtml(content: string): ParsedDocument {
  const codeBlocks: CodeBlock[] = [];
  const steps: string[] = [];
  let title: string | undefined;

  // Extract title
  const titleMatch = content.match(/<title>([^<]+)<\/title>/i);
  if (titleMatch && titleMatch[1]) {
    title = titleMatch[1].trim();
  }

  // Extract code blocks from <pre><code> or <code>
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

  // Extract list items
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

function parsePlainText(content: string): ParsedDocument {
  const lines = content.split("\n");
  const steps: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Extract numbered steps (e.g., "1. do something")
    const numberedMatch = trimmed.match(/^\d+\.\s+(.+)$/);
    if (numberedMatch && numberedMatch[1]) {
      steps.push(numberedMatch[1].trim());
      continue;
    }

    // Extract bullet points
    const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (bulletMatch && bulletMatch[1]) {
      steps.push(bulletMatch[1].trim());
      continue;
    }

    // Check if it looks like a step
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

function isLikelyStep(text: string): boolean {
  const stepPatterns = [
    /^(run|execute|type|enter|press|click|open|start|stop|wait|check|verify|assert)/i,
    /^(输入|执行|运行|点击|打开|启动|停止|等待|检查|验证)/,
    /\$\s+\w+/, // Shell prompt pattern
    /^>\s+\w+/, // Alternative prompt
  ];

  return stepPatterns.some((pattern) => pattern.test(text));
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
