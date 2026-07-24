/**
 * Per-task model selection: extraction is high-volume, schema-constrained
 * work where a cheaper model does fine; reasoning (Q&A, insights) is where
 * capability matters. Both fall back to OPENAI_MODEL, then a safe default.
 */
function configuredModel(value: string | undefined): string | undefined {
  const model = value?.trim();
  return model || undefined;
}

export function extractionModel(): string {
  return (
    configuredModel(process.env.EXTRACTION_MODEL) ??
    configuredModel(process.env.OPENAI_MODEL) ??
    "gpt-4o-mini"
  );
}

export function reasoningModel(): string {
  return (
    configuredModel(process.env.REASONING_MODEL) ??
    configuredModel(process.env.OPENAI_MODEL) ??
    "gpt-4o"
  );
}
