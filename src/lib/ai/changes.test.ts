import { describe, expect, it } from "vitest";
import { judgeDirection, parseWindowMonths, summarizeChanges, type ObservationPoint } from "./changes";

function point(test: string, date: string, value: number, lo: number | null, hi: number | null): ObservationPoint {
  const interpretation =
    lo !== null && value < lo ? "low" : hi !== null && value > hi ? "high" : "normal";
  return { test, date, value, unit: "mg/dL", referenceLow: lo, referenceHigh: hi, interpretation };
}

describe("parseWindowMonths", () => {
  it("reads months, years and weeks", () => {
    expect(parseWindowMonths("What improved over the last 6 months?")).toBe(6);
    expect(parseWindowMonths("what got worse in the past year")).toBe(12);
    expect(parseWindowMonths("changes in the last two weeks")).toBe(1);
    expect(parseWindowMonths("last month")).toBe(1);
  });

  it("returns null when no window is named", () => {
    expect(parseWindowMonths("what has improved?")).toBeNull();
  });
});

describe("judgeDirection", () => {
  it("judges movement relative to the reference range, not just up or down", () => {
    expect(judgeDirection(210, 180, null, 200)).toBe("improved");
    expect(judgeDirection(150, 190, null, 200)).toBe("stable");
    expect(judgeDirection(190, 230, null, 200)).toBe("worsened");
    expect(judgeDirection(25, 35, 30, 100)).toBe("improved");
  });

  it("calls small moves stable and rangeless big moves unclear", () => {
    expect(judgeDirection(100, 103, null, 200)).toBe("stable");
    expect(judgeDirection(100, 150, null, null)).toBe("unclear");
  });
});

describe("summarizeChanges", () => {
  const now = new Date("2026-09-02T00:00:00Z");

  it("compares the value at the window's start with the latest value", () => {
    const summary = summarizeChanges(
      [
        point("Triglycerides", "2025-12-01", 240, null, 150),
        point("Triglycerides", "2026-02-15", 220, null, 150),
        point("Triglycerides", "2026-08-20", 140, null, 150),
        point("ALT", "2026-01-10", 30, null, 45),
        point("ALT", "2026-08-20", 67, null, 45),
        point("HbA1c", "2026-08-20", 5.6, null, 5.7),
        point("TSH", "2025-06-01", 2.1, 0.4, 4),
      ],
      { windowMonths: 6, now }
    );

    expect(summary.since).toBe("2026-03-02");
    expect(summary.changes.map((c) => [c.test, c.direction])).toEqual([
      ["ALT", "worsened"],
      ["Triglycerides", "improved"],
    ]);
    // Baseline is the last reading before the window opened, not the earliest ever.
    expect(summary.changes[1].from).toEqual({ date: "2026-02-15", value: 220 });
    expect(summary.singleValueTests).toEqual(["HbA1c"]);
    // TSH has nothing recent, so it is neither compared nor listed.
    expect(summary.changes.some((c) => c.test === "TSH")).toBe(false);
  });

  it("uses the whole history when no window is given", () => {
    const summary = summarizeChanges(
      [point("ALT", "2024-01-10", 80, null, 45), point("ALT", "2026-08-20", 40, null, 45)],
      { windowMonths: null, now }
    );
    expect(summary.changes[0]).toMatchObject({ test: "ALT", direction: "improved", deltaPercent: -50 });
  });
});
