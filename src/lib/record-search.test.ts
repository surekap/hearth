import { describe, expect, it } from "vitest";
import { compareRecordDates, matchesRecord, parseRecordFilters, recordSearchHref } from "./record-search";

const filters = (params: Record<string, string> = {}) => parseRecordFilters(params);
describe("record search", () => {
  it("finds dental and eye reports through clinical synonyms", () => {
    expect(matchesRecord("Root canal for tooth 24", "2024-01-02", filters({ q: "dental" }))).toBe(true);
    expect(matchesRecord("Retinal imaging follow-up", "2024-01-02", filters({ q: "eye" }))).toBe(true);
    expect(matchesRecord("Ophthalmology consultation", null, filters({ specialty: "eye" }))).toBe(true);
    expect(matchesRecord("Kidney screening", null, filters({ specialty: "eye" }))).toBe(false);
  });
  it("combines search terms, specialty and inclusive report dates", () => {
    const f = filters({ q: "retinal follow up", specialty: "eye", from: "2023-01-01", to: "2024-01-01" });
    expect(matchesRecord("Retinal follow-up", "2023-01-01", f)).toBe(true);
    expect(matchesRecord("Retinal follow-up", "2024-01-01", f)).toBe(true);
    expect(matchesRecord("Retinal follow-up", "2024-01-02", f)).toBe(false);
    expect(matchesRecord("Retinal follow-up", null, f)).toBe(false);
    expect(matchesRecord("Retinal exam", "2023-01-01", f)).toBe(false);
  });
  it("normalizes malformed URL parameters without crashing", () => {
    expect(parseRecordFilters({ q: ["eye", "dental"], specialty: "__proto__", from: "2024-02-30", to: "bad", sort: "bad" })).toEqual(filters());
    expect(matchesRecord("Any record", null, filters())).toBe(true);
    expect(matchesRecord("constructor", null, filters({ q: "constructor" }))).toBe(true);
  });
  it("sorts chronologically in either direction and keeps undated scans last", () => {
    const dates = [null, "2024-01-01", "2020-05-12"];
    expect([...dates].sort((a, b) => compareRecordDates(a, b, "oldest"))).toEqual(["2020-05-12", "2024-01-01", null]);
    expect([...dates].sort((a, b) => compareRecordDates(a, b, "newest"))).toEqual(["2024-01-01", "2020-05-12", null]);
  });
  it("preserves search when navigating between views", () => {
    const f = filters({ q: "eye & retina", specialty: "eye", sort: "oldest", from: "2020-01-01" });
    const url = new URL(recordSearchHref("/documents", f), "http://localhost");
    expect(parseRecordFilters(Object.fromEntries(url.searchParams))).toEqual(f);
  });
});
