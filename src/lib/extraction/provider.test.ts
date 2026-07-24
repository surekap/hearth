import { describe, expect, it } from "vitest";
import { extractionProviderName } from "./provider";

describe("extractionProviderName", () => {
  it("honors an explicit OpenAI provider", () => {
    expect(
      extractionProviderName({
        EXTRACTION_PROVIDER: "openai",
        OPENAI_API_KEY: "test-key",
      })
    ).toBe("openai");
  });

  it("honors an explicit mock provider even when an API key exists", () => {
    expect(
      extractionProviderName({
        EXTRACTION_PROVIDER: "mock",
        OPENAI_API_KEY: "test-key",
      })
    ).toBe("mock");
  });

  it("requires an API key when OpenAI is explicitly configured", () => {
    expect(() =>
      extractionProviderName({
        EXTRACTION_PROVIDER: "openai",
        OPENAI_API_KEY: undefined,
      })
    ).toThrow("OPENAI_API_KEY is not configured");
  });

  it("rejects unsupported provider names", () => {
    expect(() =>
      extractionProviderName({
        EXTRACTION_PROVIDER: "other",
        OPENAI_API_KEY: "test-key",
      })
    ).toThrow("Unsupported EXTRACTION_PROVIDER: other");
  });

  it("keeps automatic selection when no provider is configured", () => {
    expect(
      extractionProviderName({
        EXTRACTION_PROVIDER: undefined,
        OPENAI_API_KEY: "test-key",
      })
    ).toBe("openai");
    expect(
      extractionProviderName({
        EXTRACTION_PROVIDER: undefined,
        OPENAI_API_KEY: undefined,
      })
    ).toBe("mock");
  });
});
