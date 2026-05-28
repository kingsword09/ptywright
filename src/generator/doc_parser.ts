import {
  parseHtml,
  parseJson,
  parseMarkdown,
  parsePlainText,
  parseYaml,
} from "./doc_format_parsers";
import { detectDocumentFormat, fetchDocumentContent } from "./doc_source";
import type { DocumentSource, ParsedDocument } from "./doc_parser_types";

export type { CodeBlock, DocumentFormat, DocumentSource, ParsedDocument } from "./doc_parser_types";

export async function parseDocument(source: DocumentSource): Promise<ParsedDocument> {
  const content = await fetchDocumentContent(source);
  const format = detectDocumentFormat(source, content);

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
