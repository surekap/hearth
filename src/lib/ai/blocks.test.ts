import { describe, expect, it } from "vitest";
import { encodeBlocks, parseAnswer, stripBlocks, type AnswerBlock } from "./blocks";

const block: AnswerBlock = {
  type: "series-chart",
  test: "ALT",
  unit: "U/L",
  referenceLow: null,
  referenceHigh: 45,
  points: [{ date: "2026-01-10", value: 30, interpretation: "normal" }],
};

describe("answer blocks", () => {
  it("round-trips blocks through the answer text", () => {
    const encoded = encodeBlocks("**Answer**\nALT is fine.", [block]);
    const parsed = parseAnswer(encoded);
    expect(parsed.markdown).toBe("**Answer**\nALT is fine.");
    expect(parsed.blocks).toEqual([block]);
    expect(stripBlocks(encoded)).toBe("**Answer**\nALT is fine.");
  });

  it("leaves plain answers alone and tolerates a corrupt fence", () => {
    expect(parseAnswer("plain")).toEqual({ markdown: "plain", blocks: [] });
    expect(parseAnswer("x\n\n```hearth-blocks\n{oops\n```").blocks).toEqual([]);
  });
});
