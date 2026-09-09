import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("openai", () => ({ default: class { responses = { create }; } }));
vi.mock("@/lib/ai/models", () => ({ utilityModel: () => "test-model", reasoningOptions: () => ({}) }));
import { interpretSearch, validateSearchPlan } from "./record-search-plan";
const valid = { concepts: [["kidney", "renal"], ["ultrasound", "sonography"]], exclude: [], from: "2025-01-01", to: "2025-12-31", order: "oldest" };
beforeEach(() => { vi.stubEnv("OPENAI_API_KEY", "test-only"); create.mockReset(); });
afterEach(() => vi.unstubAllEnvs());
describe("query interpretation", () => {
  it("validates model output and sends only the query for interpretation", async () => {
    create.mockResolvedValue({ output_text: JSON.stringify(valid) });
    expect(await interpretSearch("kidney scans last year oldest first", "user:a", "2026-09-09")).toEqual(valid);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ input: "kidney scans last year oldest first", store: false }));
    await interpretSearch("KIDNEY scans last year oldest first", "user:a", "2026-09-09");
    expect(create).toHaveBeenCalledTimes(1);
    await interpretSearch("kidney scans last year oldest first", "user:b", "2026-09-09");
    expect(create).toHaveBeenCalledTimes(2);
  });
  it("does not let a single keyword acquire extra required concepts", async () => {
    create.mockResolvedValue({ output_text: JSON.stringify({ ...valid, concepts: [["migraine"], ["neurology"]] }) });
    expect((await interpretSearch("migraine", "single-keyword-test", "2026-09-09")).concepts).toEqual([["migraine", "neurology"]]);
  });
  it("rejects invalid dates, unconstrained plans and empty concept groups", () => {
    expect(() => validateSearchPlan({ ...valid, from: "2025-02-30" })).toThrow();
    expect(() => validateSearchPlan({ ...valid, from: "2026-01-01" })).toThrow();
    expect(() => validateSearchPlan({ ...valid, concepts: [], from: null, to: null })).toThrow();
    expect(() => validateSearchPlan({ ...valid, concepts: [[]] })).toThrow();
    expect(validateSearchPlan({ ...valid, concepts: [] })).toMatchObject({ concepts: [] });
  });
});
