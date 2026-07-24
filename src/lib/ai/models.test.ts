import { afterEach, describe, expect, it } from "vitest";
import { extractionModel, reasoningModel } from "./models";

const originalEnvironment = {
  EXTRACTION_MODEL: process.env.EXTRACTION_MODEL,
  REASONING_MODEL: process.env.REASONING_MODEL,
  OPENAI_MODEL: process.env.OPENAI_MODEL,
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
    expect(reasoningModel()).toBe("gpt-4o");
  });

  it("trims configured model names", () => {
    process.env.EXTRACTION_MODEL = " gpt-4.1-mini ";
    process.env.REASONING_MODEL = " gpt-4.1 ";

    expect(extractionModel()).toBe("gpt-4.1-mini");
    expect(reasoningModel()).toBe("gpt-4.1");
  });
});
