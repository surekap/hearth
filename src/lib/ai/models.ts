/**
 * Per-task model selection: extraction is high-volume, schema-constrained
 * work where a cheaper model does fine; reasoning (Q&A, insights) is where
 * capability matters. Both fall back to OPENAI_MODEL, then a safe default.
 */
export function extractionModel(): string {
  return process.env.EXTRACTION_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini";
}

export function reasoningModel(): string {
  return process.env.REASONING_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-4o";
}
