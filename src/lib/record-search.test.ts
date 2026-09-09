import { afterEach, describe, expect, it, vi } from "vitest";
import { SearchCache, keywordPlan, normalizeQuery, searchRecords, type IndexedRecord, type SearchPlan } from "./record-search";

const record = (id: string, text: string, date: string | null = "2024-01-01"): IndexedRecord => ({ id, title: `Report ${id}`, text, date, dateIsFallback: false, kind: "report", href: `/documents/${id}/review` });
const plan = (concepts: string[][], extra: Partial<SearchPlan> = {}): SearchPlan => ({ concepts, exclude: [], from: null, to: null, order: "newest", ...extra });
afterEach(() => vi.useRealTimers());
describe("record retrieval", () => {
  it("supports arbitrary interpreted concepts with AND groups and OR synonyms", () => {
    const records = [record("a", "Renal ultrasound at North Clinic"), record("b", "Renal panel"), record("c", "Thyroid ultrasound")];
    expect(searchRecords(records, plan([["kidney", "renal"], ["ultrasound", "sonography"]])).map(r => r.id)).toEqual(["a"]);
    expect(searchRecords(records, plan([["thyroid"], ["ultrasound"]])).map(r => r.id)).toEqual(["c"]);
  });
  it("handles date-only searches, boundaries, exclusions and requested chronology", () => {
    const records = [record("a", "scan", "2023-01-01"), record("b", "scan", "2024-01-01"), record("c", "invoice", "2023-06-01"), record("d", "scan", null), record("e", "scan", "2024-01-02")];
    expect(searchRecords(records, plan([], { from: "2023-01-01", to: "2024-01-01", exclude: ["invoice"], order: "oldest" })).map(r => r.id)).toEqual(["a", "b"]);
    expect(searchRecords(records, plan([["scan"]])).map(r => r.id)).toEqual(["e", "b", "a", "d"]);
  });
  it("does not match substrings inside unrelated words or expose raw report text", () => {
    const result = searchRecords([record("a", "Heart monitor"), record("b", "Ear exam")], keywordPlan("ear"));
    expect(result.map(r => r.id)).toEqual(["b"]);
    expect(result[0]).not.toHaveProperty("text");
    expect(searchRecords([record("c", "Échographie rénale")], keywordPlan("echographie"))).toHaveLength(1);
  });
});
describe("search cache", () => {
  it("deduplicates in-flight queries and expires stale records", async () => {
    vi.useFakeTimers();
    const cache = new SearchCache<number>(2, 30_000);
    const load = vi.fn().mockResolvedValue(1);
    await Promise.all([cache.get("profile:a", load), cache.get("profile:a", load)]);
    expect(load).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30_001);
    await cache.get("profile:a", load);
    expect(load).toHaveBeenCalledTimes(2);
  });
  it("isolates scopes, bounds memory and retries failures", async () => {
    const cache = new SearchCache<number>(2, 30_000);
    const load = vi.fn().mockResolvedValue(1);
    await cache.get("user1:profile1:query", load);
    await cache.get("user2:profile2:query", load);
    expect(load).toHaveBeenCalledTimes(2);
    await cache.get("third", load);
    await cache.get("user1:profile1:query", load);
    expect(load).toHaveBeenCalledTimes(4);
    await expect(cache.get("failure", () => Promise.reject(new Error("offline")))).rejects.toThrow("offline");
    await expect(cache.get("failure", load)).resolves.toBe(1);
    expect(normalizeQuery("  KIDNEY   Reports ")).toBe("kidney reports");
  });
});
