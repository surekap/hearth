import { describe, expect, it } from "vitest";
import { healthSampleAggregateMetric } from "./samples";

describe("Health Bridge sample aggregation", () => {
  it("sums additive samples and preserves their source count", () => {
    expect(
      healthSampleAggregateMetric({
        day: "2026-08-20",
        data_type: "steps",
        unit: "count",
        sample_count: "47",
        sum_value: "12345",
        avg_value: "262.66",
        latest_synced_at: "2026-08-20T19:32:57.821Z",
        source_names: ["Prateek’s Apple Watch"],
      })
    ).toEqual(
      expect.objectContaining({
        canonicalName: "Steps",
        value: 12345,
        unit: "steps",
        aggregation: "daily_sum",
        sourceCount: 47,
      })
    );
  });

  it("averages physiological samples using Hearth's canonical unit", () => {
    expect(
      healthSampleAggregateMetric({
        day: new Date("2026-08-20T00:00:00Z"),
        data_type: "resting_hr",
        unit: "count/min",
        sample_count: 2,
        sum_value: 116,
        avg_value: 58,
        latest_synced_at: null,
        source_names: [],
      })
    ).toEqual(expect.objectContaining({ canonicalName: "Resting Heart Rate", value: 58, unit: "bpm" }));
  });

  it("ignores unknown types until their semantics are explicitly mapped", () => {
    expect(
      healthSampleAggregateMetric({
        day: "2026-08-20",
        data_type: "future_metric",
        unit: "widget",
        sample_count: 1,
        sum_value: 10,
        avg_value: 10,
        latest_synced_at: null,
        source_names: [],
      })
    ).toBeNull();
  });
});
