import { afterEach, describe, expect, it } from "vitest";
import { extractionModel, reasoningModel, utilityModel, reasoningOptions } from "./models";

const originalEnvironment = {
  EXTRACTION_MODEL: process.env.EXTRACTION_MODEL,
  REASONING_MODEL: process.env.REASONING_MODEL,
  OPENAI_MODEL: process.env.OPENAI_MODEL,
  UTILITY_MODEL: process.env.UTILITY_MODEL,
};

afterEach(() => {
  for (const [name, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
});

describe("AI model selection", () => {
  it("ignores empty task-specific model variables", () => {
    process.env.EXTRACTION_MODEL = "";
    process.env.REASONING_MODEL = "  ";
    process.env.OPENAI_MODEL = "gpt-4o";

    expect(extractionModel()).toBe("gpt-4o");
    expect(reasoningModel()).toBe("gpt-4o");
  });

  it("uses safe defaults when all configured model variables are blank", () => {
    process.env.EXTRACTION_MODEL = "";
    process.env.REASONING_MODEL = "";
    process.env.OPENAI_MODEL = "";

    expect(extractionModel()).toBe("gpt-4o-mini");
    expect(reasoningModel()).toBe("gpt-5.6-sol");
  });

  it("trims configured model names", () => {
    process.env.EXTRACTION_MODEL = " gpt-4.1-mini ";
    process.env.REASONING_MODEL = " gpt-4.1 ";

    expect(extractionModel()).toBe("gpt-4.1-mini");
    expect(reasoningModel()).toBe("gpt-4.1");
  });

  it("keeps simple text work on a separate cheap model", () => {
    process.env.OPENAI_MODEL = "gpt-5.6-sol";
    process.env.UTILITY_MODEL = "";
    expect(utilityModel()).toBe("gpt-5.6-luna");
    process.env.UTILITY_MODEL = " gpt-4o-mini ";
    expect(utilityModel()).toBe("gpt-4o-mini");
    expect(reasoningOptions("gpt-4o-mini", "low")).toEqual({});
    expect(reasoningOptions("gpt-5.6-sol", "high")).toEqual({ reasoning: { effort: "high" } });
  });
});
