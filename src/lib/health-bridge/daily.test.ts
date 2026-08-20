import { describe, expect, it } from "vitest";
import { healthDailyDate, healthDailyMetrics } from "./daily";

describe("Health Bridge daily mapping", () => {
  it("maps daily summaries to Hearth metrics", () => {
    const metrics = healthDailyMetrics({
      date: "2026-08-20",
      steps: 12345,
      resting_hr: "57",
      sleep_total: 7.5,
      weight_kg: null,
    });

    expect(metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ canonicalName: "Steps", value: 12345, aggregation: "daily_sum" }),
        expect.objectContaining({ canonicalName: "Resting Heart Rate", value: 57, aggregation: "daily_avg" }),
        expect.objectContaining({ canonicalName: "Sleep Duration", value: 7.5 }),
      ])
    );
    expect(metrics.some((metric) => metric.canonicalName === "Weight")).toBe(false);
  });

  it("normalizes fractional percentages and ignores invalid values", () => {
    const metrics = healthDailyMetrics({
      date: "2026-08-20",
      spo2: 0.98,
      body_fat_pct: -1,
      walking_steadiness: "not-a-number",
    });

    expect(metrics).toEqual([
      expect.objectContaining({ canonicalName: "Oxygen Saturation", value: 98 }),
    ]);
  });

  it("accepts only valid daily dates", () => {
    expect(healthDailyDate({ date: "2026-08-20" })).toBe("2026-08-20");
    expect(healthDailyDate({ date: "20/08/2026" })).toBeNull();
  });
});
