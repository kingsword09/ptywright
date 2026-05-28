import type { ParsedDocument } from "./doc_parser";
import type { ExtractedLaunch, ExtractedStep, ExtractionResult } from "./step_extractor_types";
import {
  extractFromGenericCodeBlock,
  extractFromShellBlock,
  isShellLanguage,
} from "./step_extractor_shell";
import { extractFromTextStep } from "./step_extractor_text";
import { insertDefaultWaits } from "./step_extractor_waits";

export type { ExtractedLaunch, ExtractedStep, ExtractionResult } from "./step_extractor_types";

export function extractSteps(doc: ParsedDocument): ExtractionResult {
  const warnings: string[] = [];
  const steps: ExtractedStep[] = [];
  let launch: ExtractedLaunch | undefined;

  // Priority 1: Extract from shell/bash code blocks
  for (const block of doc.codeBlocks) {
    if (isShellLanguage(block.language)) {
      const extracted = extractFromShellBlock(block);
      if (!launch && extracted.launch) {
        launch = extracted.launch;
      }
      steps.push(...extracted.steps);
    }
  }

  // Priority 2: Extract from text steps if no code blocks found
  if (steps.length === 0 && doc.steps.length > 0) {
    for (const textStep of doc.steps) {
      const extracted = extractFromTextStep(textStep);
      if (extracted) {
        steps.push(extracted);
      }
    }
  }

  // Priority 3: Try to extract from any code blocks
  if (steps.length === 0) {
    for (const block of doc.codeBlocks) {
      if (!isShellLanguage(block.language)) {
        const extracted = extractFromGenericCodeBlock(block);
        steps.push(...extracted);
      }
    }
  }

  // Add default waits between input steps
  const stepsWithWaits = insertDefaultWaits(steps);

  // Validate and add warnings
  if (!launch && stepsWithWaits.length > 0) {
    warnings.push("No launch command detected. You may need to specify targetCommand.");
  }

  if (stepsWithWaits.length === 0) {
    warnings.push("No test steps could be extracted from the document.");
  }

  return {
    launch,
    steps: stepsWithWaits,
    warnings,
  };
}
