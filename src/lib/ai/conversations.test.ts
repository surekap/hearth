import { describe, expect, it } from "vitest";
import { conversationTitle } from "./conversation-title";

describe("conversationTitle", () => {
  it("normalizes whitespace for a concise topic title", () => {
    expect(conversationTitle("  How is my\n\nbone health?  ")).toBe(
      "How is my bone health?"
    );
  });

  it("limits long titles", () => {
    const title = conversationTitle("a".repeat(100));

    expect(title).toHaveLength(62);
    expect(title.endsWith("…")).toBe(true);
  });
});
