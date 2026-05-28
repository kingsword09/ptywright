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

export type DocumentFormat = "markdown" | "html" | "json" | "yaml" | "text";

export type ParsedDocument = {
  title?: string;
  description?: string;
  codeBlocks: CodeBlock[];
  steps: string[];
  rawContent: string;
  format: DocumentFormat;
};
