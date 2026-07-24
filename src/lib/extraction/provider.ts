export type ExtractionProvider = "openai" | "mock";

type ExtractionEnvironment = {
  EXTRACTION_PROVIDER?: string;
  OPENAI_API_KEY?: string;
};

export function extractionProviderName(
  environment?: ExtractionEnvironment
): ExtractionProvider {
  const source = environment ?? {
    EXTRACTION_PROVIDER: process.env.EXTRACTION_PROVIDER,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  };
  const configured = source.EXTRACTION_PROVIDER?.trim().toLowerCase();

  if (configured === "mock") return "mock";
  if (configured === "openai") {
    if (!source.OPENAI_API_KEY) {
      throw new Error(
        "EXTRACTION_PROVIDER is set to openai, but OPENAI_API_KEY is not configured."
      );
    }
    return "openai";
  }
  if (configured) {
    throw new Error(`Unsupported EXTRACTION_PROVIDER: ${configured}`);
  }

  return source.OPENAI_API_KEY ? "openai" : "mock";
}
