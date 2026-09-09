import { describe, expect, it, vi } from "vitest";
vi.mock("@/db", () => ({ db: {}, schema: {} }));
import { rankSourceSections } from "./snippets";
describe("page-aware source retrieval", () => {
  it("finds a scanner detail later in the source and preserves its page", () => {
    const results = rankSourceSections(`[Page 1]\nUnrelated\n[Page 9]\n${"filler ".repeat(600)}GE Lunar Prodigy DEXA scanner`, "Compare my body composition");
    expect(results[0].page).toBe(9);
    expect(results[0].snippet).toContain("GE Lunar Prodigy");
  });
});
