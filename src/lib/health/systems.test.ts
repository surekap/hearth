import { describe, expect, it } from "vitest";
import {
  SYSTEMS,
  categoryLabel,
  metricBelongsTo,
  selectSystemChartMetrics,
  selectSystemHero,
  systemFor,
} from "./systems";

describe("registry", () => {
  it("has unique ids and exposes lookups", () => {
    const ids = SYSTEMS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(systemFor("cardiovascular")?.title).toBe("Heart & circulation");
    expect(systemFor("nope")).toBeUndefined();
  });
});

describe("metricBelongsTo", () => {
  it("matches by category", () => {
    const cardio = systemFor("cardiovascular")!;
    expect(metricBelongsTo(cardio, { category: "lipid", name: "LDL" })).toBe(true);
    expect(metricBelongsTo(cardio, { category: "sleep", name: "Sleep Duration" })).toBe(false);
  });
  it("matches bone metrics by name since they live in the body category", () => {
    const bone = systemFor("bone")!;
    expect(metricBelongsTo(bone, { category: "body", name: "DEXA total body T-score" })).toBe(true);
    expect(metricBelongsTo(bone, { category: "body", name: "Weight" })).toBe(false);
    expect(metricBelongsTo(bone, { category: "body", name: "Bone Density T-score" })).toBe(true);
    expect(metricBelongsTo(bone, { category: "body", name: "Total hip BMD" })).toBe(true);
  });
  it("routes unknown canonical measurements to the adaptive clinical system", () => {
    expect(
      metricBelongsTo(systemFor("clinical")!, {
        category: "other",
        name: "New vendor-specific measurement",
      })
    ).toBe(true);
    expect(
      metricBelongsTo(systemFor("immune")!, {
        category: "other",
        name: "New vendor-specific measurement",
      })
    ).toBe(false);
  });
});

describe("selectSystemHero", () => {
  it("prefers a newly ingested canonical metric over an older hard-coded alias", () => {
    const bone = systemFor("bone")!;
    const hero = selectSystemHero(bone, [
      {
        name: "DEXA total body T-score",
        latestDate: "2026-03-17T00:00:00.000Z",
        latestValue: 1.6,
        latestText: null,
      },
      {
        name: "Bone Density T-score",
        latestDate: "2026-09-01T00:00:00.000Z",
        latestValue: -0.3,
        latestText: null,
      },
    ]);
    expect(hero?.name).toBe("Bone Density T-score");
  });
});

describe("selectSystemChartMetrics", () => {
  it("puts newly ingested trends ahead of older curated metrics", () => {
    const cardio = systemFor("cardiovascular")!;
    const charts = selectSystemChartMetrics(
      cardio,
      [
        {
          typeId: "resting-heart-rate",
          name: "Resting Heart Rate",
          latestDate: "2026-06-01T00:00:00.000Z",
          pointCount: 62,
        },
        {
          typeId: "blood-pressure",
          name: "Blood pressure",
          latestDate: "2026-09-01T00:00:00.000Z",
          pointCount: 4,
        },
        {
          typeId: "exercise-capacity",
          name: "Exercise Capacity",
          latestDate: "2026-09-01T00:00:00.000Z",
          pointCount: 2,
        },
      ],
      2
    );

    expect(charts.map((chart) => chart.name)).toEqual([
      "Blood pressure",
      "Exercise Capacity",
    ]);
  });

  it("skips one-off values that cannot form a trend chart", () => {
    const clinical = systemFor("clinical")!;
    const charts = selectSystemChartMetrics(
      clinical,
      [
        {
          typeId: "single",
          name: "New single value",
          latestDate: "2026-09-01T00:00:00.000Z",
          pointCount: 1,
        },
        {
          typeId: "trend",
          name: "Existing trend",
          latestDate: "2026-08-01T00:00:00.000Z",
          pointCount: 3,
        },
      ],
      6
    );

    expect(charts.map((chart) => chart.name)).toEqual(["Existing trend"]);
  });
});

describe("categoryLabel", () => {
  it("uses known labels and titleizes unknown ones", () => {
    expect(categoryLabel("hematology")).toBe("Blood counts");
    expect(categoryLabel("tumor_marker")).toBe("Cancer screening");
    expect(categoryLabel("made_up_thing")).toBe("Made Up Thing");
  });
});
