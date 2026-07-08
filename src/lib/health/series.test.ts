import { describe, expect, it } from "vitest";
import {
  attentionState,
  downsampleEven,
  formatMetricValue,
  rangeStart,
  rawSeries,
  rollupPeriodFor,
  rollupSeries,
  shouldUseRollups,
  trendOf,
} from "./series";

const NOW = new Date("2026-07-08T00:00:00Z");

describe("rangeStart", () => {
  it("returns null for all-time", () => {
    expect(rangeStart("all", NOW)).toBeNull();
  });
  it("returns 3 months back for 3m", () => {
    expect(rangeStart("3m", NOW)?.toISOString()).toBe("2026-04-08T00:00:00.000Z");
  });
});

describe("shouldUseRollups", () => {
  it("uses raw points at or below the threshold", () => {
    expect(shouldUseRollups(120)).toBe(false);
  });
  it("uses rollups above the threshold", () => {
    expect(shouldUseRollups(121)).toBe(true);
  });
});

describe("rollupPeriodFor", () => {
  it("maps ranges to periods", () => {
    expect(rollupPeriodFor("3m")).toBe("day");
    expect(rollupPeriodFor("6m")).toBe("week");
    expect(rollupPeriodFor("1y")).toBe("week");
    expect(rollupPeriodFor("3y")).toBe("month");
    expect(rollupPeriodFor("all")).toBe("month");
  });
});

describe("attentionState", () => {
  it("flags recent high values", () => {
    expect(
      attentionState({ interpretation: "high", observedAt: new Date("2026-03-17"), now: NOW })
    ).toBe("attention");
  });
  it("demotes abnormal values older than 18 months to historical", () => {
    expect(
      attentionState({ interpretation: "low", observedAt: new Date("2018-01-28"), now: NOW })
    ).toBe("historical");
  });
  it("keeps critical values in attention up to 24 months", () => {
    expect(
      attentionState({ interpretation: "critical", observedAt: new Date("2024-08-01"), now: NOW })
    ).toBe("attention");
    expect(
      attentionState({ interpretation: "critical", observedAt: new Date("2023-01-01"), now: NOW })
    ).toBe("historical");
  });
  it("returns none for normal and unknown", () => {
    expect(attentionState({ interpretation: "normal", observedAt: NOW, now: NOW })).toBe("none");
    expect(attentionState({ interpretation: "unknown", observedAt: NOW, now: NOW })).toBe("none");
  });
});

describe("trendOf", () => {
  it("needs at least two values", () => {
    expect(trendOf([5])).toBeNull();
  });
  it("detects >5% rise, >5% fall, and flat", () => {
    expect(trendOf([100, 110])).toBe("rising");
    expect(trendOf([100, 90])).toBe("falling");
    expect(trendOf([100, 103])).toBe("flat");
  });
});

describe("rollupSeries", () => {
  it("builds weighted-average band points with an honest caption", () => {
    const series = rollupSeries(
      [
        { bucket: new Date("2026-06-01"), avgValue: 55, sumValue: null, minValue: 40, maxValue: 70, sourceCount: 30 },
        { bucket: new Date("2026-06-08"), avgValue: 60, sumValue: null, minValue: 45, maxValue: 80, sourceCount: 28 },
      ],
      "week"
    );
    expect(series.mode).toBe("rollup");
    expect(series.points).toHaveLength(2);
    expect(series.points[0]).toMatchObject({ value: 55, min: 40, max: 70 });
    expect(series.caption).toBe("Weekly averages from 58 readings");
  });
  it("labels sum metrics as totals without a band", () => {
    const series = rollupSeries(
      [{ bucket: new Date("2026-06-01"), avgValue: null, sumValue: 12, minValue: null, maxValue: null, sourceCount: 12 }],
      "day"
    );
    expect(series.caption).toBe("Daily totals from 12 readings");
    expect(series.points[0].min).toBeUndefined();
  });
  it("drops buckets with no value", () => {
    const series = rollupSeries(
      [{ bucket: new Date("2026-06-01"), avgValue: null, sumValue: null, minValue: 1, maxValue: 2, sourceCount: 0 }],
      "day"
    );
    expect(series.points).toHaveLength(0);
  });
});

describe("rawSeries", () => {
  const row = {
    observedAt: new Date("2026-03-17"),
    valueNumeric: 72,
    referenceLow: 0,
    referenceHigh: 50,
    interpretation: "high" as const,
  };
  it("keeps every real point and states the count", () => {
    const series = rawSeries([row, { ...row, valueNumeric: 60 }]);
    expect(series.mode).toBe("raw");
    expect(series.points).toHaveLength(2);
    expect(series.caption).toBe("All 2 recorded values");
  });
  it("uses singular caption for one point", () => {
    expect(rawSeries([row]).caption).toBe("1 recorded value");
  });
});

describe("formatMetricValue", () => {
  it("converts percent-unit fractions to percentages", () => {
    expect(formatMetricValue(0.948, "%")).toBe("94.8 %");
  });
  it("keeps real percentages as-is", () => {
    expect(formatMetricValue(39.4, "%")).toBe("39.4 %");
  });
  it("scales precision with magnitude", () => {
    expect(formatMetricValue(550.862, "kcal")).toBe("551 kcal");
    expect(formatMetricValue(20.991, "ms")).toBe("21 ms");
    expect(formatMetricValue(5.73, null)).toBe("5.73");
    expect(formatMetricValue(0.97)).toBe("0.97");
  });
});

describe("downsampleEven", () => {
  it("returns input untouched when under the limit", () => {
    expect(downsampleEven([1, 2, 3], 5)).toEqual([1, 2, 3]);
  });
  it("keeps the last element when sampling", () => {
    const items = Array.from({ length: 100 }, (_, i) => i);
    const out = downsampleEven(items, 10);
    expect(out.length).toBeLessThanOrEqual(11);
    expect(out[out.length - 1]).toBe(99);
  });
});
