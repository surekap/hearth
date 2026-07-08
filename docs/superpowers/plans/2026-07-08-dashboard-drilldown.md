# Dashboard Drill-Down Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-page dashboard with a three-level drill-down (overview → system pages → metric detail pages), folding Labs into the flow, with rollup-aware charts and no fabricated data.

**Architecture:** A new `src/lib/health/` data layer (pure series logic + registry + per-page loaders) feeds four route groups: `/dashboard` (launcher), `/dashboard/[system]`, `/metrics` (index, replaces `/labs`), `/metrics/[typeId]` (detail). Dense metrics read `health_rollups` (day rows, bucketed to week/month via `date_trunc` at query time); sparse metrics render raw points. Spec: `docs/superpowers/specs/2026-07-08-dashboard-drilldown-design.md`.

**Tech Stack:** Next.js 16.2.10 (App Router), Drizzle + pg (Neon in prod, local Postgres.app in dev), Recharts 3.9, shadcn/ui, Tailwind v4, vitest (new dev-dep).

## Global Constraints

- **Next.js 16:** `params` and `searchParams` are `Promise`s — always `await` them (see `src/app/(app)/dashboard/page.tsx:9-19`). If unsure about an API, read `node_modules/next/dist/docs/` per AGENTS.md.
- **Profile scoping:** every clinical query filters by `profileId` obtained from `getActiveProfile(session.user.id)` (pages) or `requireProfile` (API routes). Never query observations without it.
- **Data integrity:** only `status = 'confirmed'` observations render. Never interpolate points. Single-point metrics get a value card, never a trend line. Every aggregated chart carries a caption stating aggregation + source count.
- **Locale:** dates via `toLocaleDateString("en-IN", ...)`, numbers via `toLocaleString("en-IN")` (existing pattern).
- **UI patterns:** Badge chip + `text-3xl font-semibold` h1 header, `Card` from `src/components/ui/card.tsx`, `EmptyState` from `src/components/ui/mascot.tsx`, teal/navy tokens (`var(--primary)`, `var(--warning)`, `var(--success)`, `text-destructive`).
- **No new runtime deps.** Only `vitest` as dev-dep.
- **DB verification:** use `/Applications/Postgres.app/Contents/Versions/17/bin/psql "$DATABASE_URL"` (psql is not on PATH). Local dev DB: `postgresql://postgres:catacomb@localhost:5432/hearth`.
- Commit after every task with the trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Vitest setup + pure series logic (`series.ts`)

**Files:**
- Create: `src/lib/health/series.ts`
- Create: `src/lib/health/series.test.ts`
- Modify: `package.json` (add vitest + `test` script)

**Interfaces:**
- Produces (used by Tasks 3, 7, 8):
  - `type RangeKey = "3m" | "6m" | "1y" | "3y" | "all"`
  - `type RollupPeriod = "day" | "week" | "month"`
  - `type Interpretation = "low" | "normal" | "high" | "critical" | "unknown"`
  - `type SeriesPoint = { date: string; value: number; min?: number; max?: number; referenceLow: number | null; referenceHigh: number | null; interpretation: Interpretation }`
  - `type MetricSeries = { mode: "raw" | "rollup"; period: RollupPeriod | null; caption: string; points: SeriesPoint[] }`
  - `RANGES: RangeKey[]`, `DENSITY_THRESHOLD = 120`
  - `rangeStart(range, now?): Date | null`
  - `shouldUseRollups(rawCount): boolean`
  - `rollupPeriodFor(range): RollupPeriod`
  - `attentionState({ interpretation, observedAt, now? }): "attention" | "historical" | "none"`
  - `trendOf(values: number[]): "rising" | "falling" | "flat" | null`
  - `rollupSeries(rows: RollupBucketRow[], period): MetricSeries`
  - `rawSeries(rows): MetricSeries`
  - `downsampleEven<T>(items: T[], max: number): T[]`

- [ ] **Step 1: Install vitest and add script**

```bash
npm install -D vitest
```

Edit `package.json` scripts, after `"lint": "eslint",` add:

```json
    "test": "vitest run",
```

- [ ] **Step 2: Write the failing tests**

Create `src/lib/health/series.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  attentionState,
  downsampleEven,
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/lib/health/series.test.ts`
Expected: FAIL — cannot resolve `./series`.

- [ ] **Step 4: Implement `src/lib/health/series.ts`**

```ts
/**
 * Pure series logic for the health drill-down pages. No DB access here —
 * everything is unit-testable. Loaders in metric.ts/system.ts/overview.ts
 * feed these functions with query results.
 */

export type RangeKey = "3m" | "6m" | "1y" | "3y" | "all";
export type RollupPeriod = "day" | "week" | "month";
export type Interpretation = "low" | "normal" | "high" | "critical" | "unknown";

export type SeriesPoint = {
  date: string;
  value: number;
  min?: number;
  max?: number;
  referenceLow: number | null;
  referenceHigh: number | null;
  interpretation: Interpretation;
};

export type MetricSeries = {
  mode: "raw" | "rollup";
  period: RollupPeriod | null;
  caption: string;
  points: SeriesPoint[];
};

export type RollupBucketRow = {
  bucket: Date;
  avgValue: number | null;
  sumValue: number | null;
  minValue: number | null;
  maxValue: number | null;
  sourceCount: number;
};

export const RANGES: RangeKey[] = ["3m", "6m", "1y", "3y", "all"];
export const RANGE_LABELS: Record<RangeKey, string> = {
  "3m": "3 months",
  "6m": "6 months",
  "1y": "1 year",
  "3y": "3 years",
  all: "All time",
};

/** Above this many raw points in range, charts read from rollups. */
export const DENSITY_THRESHOLD = 120;
/** Raw fallback cap when a dense metric has no rollups. */
export const MAX_RAW_POINTS = 300;

const DAY_MS = 24 * 60 * 60 * 1000;
const ATTENTION_ABNORMAL_MS = 548 * DAY_MS; // ~18 months
const ATTENTION_CRITICAL_MS = 730 * DAY_MS; // ~24 months

export function parseRange(value: string | undefined): RangeKey {
  return RANGES.includes(value as RangeKey) ? (value as RangeKey) : "all";
}

export function rangeStart(range: RangeKey, now = new Date()): Date | null {
  if (range === "all") return null;
  const months = { "3m": 3, "6m": 6, "1y": 12, "3y": 36 }[range];
  const d = new Date(now);
  d.setMonth(d.getMonth() - months);
  return d;
}

export function shouldUseRollups(rawCount: number): boolean {
  return rawCount > DENSITY_THRESHOLD;
}

export function rollupPeriodFor(range: RangeKey): RollupPeriod {
  if (range === "3m") return "day";
  if (range === "6m" || range === "1y") return "week";
  return "month";
}

export function attentionState(input: {
  interpretation: string;
  observedAt: Date;
  now?: Date;
}): "attention" | "historical" | "none" {
  const now = input.now ?? new Date();
  const age = now.getTime() - input.observedAt.getTime();
  if (input.interpretation === "critical") {
    return age <= ATTENTION_CRITICAL_MS ? "attention" : "historical";
  }
  if (input.interpretation === "high" || input.interpretation === "low") {
    return age <= ATTENTION_ABNORMAL_MS ? "attention" : "historical";
  }
  return "none";
}

export function trendOf(values: number[]): "rising" | "falling" | "flat" | null {
  if (values.length < 2) return null;
  const first = values[0];
  const last = values[values.length - 1];
  if (first === 0) return null;
  const change = (last - first) / Math.abs(first);
  if (change > 0.05) return "rising";
  if (change < -0.05) return "falling";
  return "flat";
}

const PERIOD_LABELS: Record<RollupPeriod, string> = {
  day: "Daily",
  week: "Weekly",
  month: "Monthly",
};

export function rollupSeries(rows: RollupBucketRow[], period: RollupPeriod): MetricSeries {
  const points: SeriesPoint[] = [];
  let isSum = false;
  let sourceCount = 0;
  for (const row of rows) {
    const value = row.avgValue ?? row.sumValue;
    if (value == null) continue;
    if (row.avgValue == null) isSum = true;
    sourceCount += row.sourceCount;
    points.push({
      date: row.bucket.toISOString(),
      value,
      min: row.minValue ?? undefined,
      max: row.maxValue ?? undefined,
      referenceLow: null,
      referenceHigh: null,
      interpretation: "unknown",
    });
  }
  const caption = `${PERIOD_LABELS[period]} ${isSum ? "totals" : "averages"} from ${sourceCount.toLocaleString("en-IN")} readings`;
  return { mode: "rollup", period, caption, points };
}

export function rawSeries(
  rows: Array<{
    observedAt: Date;
    valueNumeric: number;
    referenceLow: number | null;
    referenceHigh: number | null;
    interpretation: Interpretation;
  }>
): MetricSeries {
  const points: SeriesPoint[] = rows.map((r) => ({
    date: r.observedAt.toISOString(),
    value: r.valueNumeric,
    referenceLow: r.referenceLow,
    referenceHigh: r.referenceHigh,
    interpretation: r.interpretation,
  }));
  const caption =
    points.length === 1 ? "1 recorded value" : `All ${points.length} recorded values`;
  return { mode: "raw", period: null, caption, points };
}

/** Even-step downsample that always keeps the final element. */
export function downsampleEven<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  const step = Math.ceil(items.length / max);
  const sampled = items.filter((_, i) => i % step === 0);
  if (sampled[sampled.length - 1] !== items[items.length - 1]) {
    sampled.push(items[items.length - 1]);
  }
  return sampled;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/health/series.test.ts`
Expected: PASS (all tests).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/health/
git commit -m "feat: add pure series logic for rollup-aware health charts"
```

---

### Task 2: Body-system registry (`systems.ts`)

**Files:**
- Create: `src/lib/health/systems.ts`
- Create: `src/lib/health/systems.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (used by Tasks 7, 8, 9):
  - `type SystemId` (union of the ten ids below)
  - `type SystemDef = { id: SystemId; title: string; eyebrow: string; description: string; categories: string[]; metricNames: string[]; keyMetrics: string[]; heroMetrics: string[]; media?: { image: string; video?: string; position: string; tone: "light" | "dark" }; geneticTerms: string[]; reportTerms: string[] }`
  - `SYSTEMS: SystemDef[]`
  - `systemFor(id: string): SystemDef | undefined`
  - `metricBelongsTo(def: SystemDef, metric: { category: string; name: string }): boolean`
  - `CATEGORY_LABELS`, `categoryLabel(category: string): string` (moved from `src/lib/dashboard.ts:29-57`)

- [ ] **Step 1: Write the failing tests**

Create `src/lib/health/systems.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SYSTEMS, categoryLabel, metricBelongsTo, systemFor } from "./systems";

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
  });
});

describe("categoryLabel", () => {
  it("uses known labels and titleizes unknown ones", () => {
    expect(categoryLabel("hematology")).toBe("Blood counts");
    expect(categoryLabel("tumor_marker")).toBe("Cancer screening");
    expect(categoryLabel("made_up_thing")).toBe("Made Up Thing");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/health/systems.test.ts`
Expected: FAIL — cannot resolve `./systems`.

- [ ] **Step 3: Implement `src/lib/health/systems.ts`**

```ts
/**
 * Single source of truth for body systems: which observation categories and
 * metric names belong to each system, which media asset headers it, and which
 * terms match related genetic assessments and clinical reports.
 */

export type SystemId =
  | "cardiovascular"
  | "blood"
  | "kidney"
  | "metabolic"
  | "body-composition"
  | "bone"
  | "sleep"
  | "activity"
  | "nutrition"
  | "respiratory"
  | "immune";

export type SystemMedia = {
  image: string;
  video?: string;
  position: string;
  tone: "light" | "dark";
};

export type SystemDef = {
  id: SystemId;
  title: string;
  eyebrow: string;
  description: string;
  /** Observation categories whose metrics belong to this system. */
  categories: string[];
  /** Extra canonical names included regardless of category (e.g. DEXA in `body`). */
  metricNames: string[];
  /** Headline metrics charted on the system page, in order. */
  keyMetrics: string[];
  /** First of these with data becomes the overview gallery hero value. */
  heroMetrics: string[];
  media?: SystemMedia;
  geneticTerms: string[];
  reportTerms: string[];
};

export const SYSTEMS: SystemDef[] = [
  {
    id: "cardiovascular",
    title: "Heart & circulation",
    eyebrow: "Cardiovascular",
    description:
      "Blood pressure, pulse, heart-rate variability and blood fats move cardiovascular risk together.",
    categories: ["cardiovascular", "cardiac", "lipid"],
    metricNames: [],
    keyMetrics: [
      "Resting Heart Rate",
      "HRV",
      "Blood Pressure Systolic",
      "LDL",
      "HDL",
      "Triglycerides",
      "Total Cholesterol",
    ],
    heroMetrics: ["Resting Heart Rate", "LDL", "HRV"],
    media: { image: "/images/heart-circulatory.png", video: "/images/heart-circulatory.mp4", position: "50% 42%", tone: "light" },
    geneticTerms: ["heart", "cardio", "atrial", "coronary", "cholesterol", "hypertension", "thrombo"],
    reportTerms: ["cardio"],
  },
  {
    id: "blood",
    title: "Blood counts",
    eyebrow: "Hematology",
    description:
      "Hemoglobin carries oxygen, white cells fight infection, platelets and clotting factors stop bleeding.",
    categories: ["hematology", "coagulation"],
    metricNames: [],
    keyMetrics: ["Hemoglobin", "WBC Count", "Platelet Count", "RBC Count", "Ferritin"],
    heroMetrics: ["Hemoglobin", "WBC Count"],
    geneticTerms: ["anemia", "thalass", "clot", "hemochromatosis", "factor"],
    reportTerms: ["hematol"],
  },
  {
    id: "kidney",
    title: "Kidney & urine",
    eyebrow: "Renal",
    description:
      "Creatinine and eGFR describe filtration; urine markers can show leakage or irritation early.",
    categories: ["renal", "urine"],
    metricNames: [],
    keyMetrics: ["Creatinine", "eGFR", "Urea", "Uric Acid"],
    heroMetrics: ["eGFR", "Creatinine"],
    media: { image: "/images/kidney-urinary.png", video: "/images/kidney-urinary.mp4", position: "50% 50%", tone: "dark" },
    geneticTerms: ["kidney", "renal"],
    reportTerms: ["nephro", "urol"],
  },
  {
    id: "metabolic",
    title: "Metabolic, liver & hormones",
    eyebrow: "Energy systems",
    description:
      "Glucose control, liver enzymes, thyroid, inflammation and key vitamins influence each other.",
    categories: ["liver", "glucose", "inflammation", "thyroid", "hormone", "vitamin", "mineral"],
    metricNames: [],
    keyMetrics: ["HbA1c", "Fasting Glucose", "ALT", "AST", "GGT", "TSH", "CRP", "Vitamin D"],
    heroMetrics: ["HbA1c", "ALT", "Fasting Glucose"],
    media: { image: "/images/liver-metabolism.png", position: "50% 45%", tone: "light" },
    geneticTerms: ["diabetes", "liver", "thyroid", "gilbert", "fatty", "metabol"],
    reportTerms: ["gastro", "endocrin", "hepat"],
  },
  {
    id: "body-composition",
    title: "Body composition",
    eyebrow: "Body",
    description:
      "Weight, BMI, fat percentage, lean mass and visceral fat read as one picture across DEXA and wearables.",
    categories: ["body"],
    metricNames: [],
    keyMetrics: ["Weight", "BMI", "Body Fat Percentage", "Lean Body Mass", "Waist Circumference"],
    heroMetrics: ["Weight", "BMI"],
    media: { image: "/images/body-composition.png", position: "50% 38%", tone: "light" },
    geneticTerms: ["obesity", "weight"],
    reportTerms: [],
  },
  {
    id: "bone",
    title: "Bone density",
    eyebrow: "DEXA",
    description:
      "Bone mineral density with its T- and Z-scores, straight from DEXA scans.",
    categories: [],
    metricNames: [
      "DEXA total body BMD",
      "DEXA total body T-score",
      "DEXA total body Z-score",
      "Total body bone mineral content",
    ],
    keyMetrics: ["DEXA total body T-score", "DEXA total body BMD"],
    heroMetrics: ["DEXA total body T-score"],
    geneticTerms: ["osteo", "bone"],
    reportTerms: ["dexa", "ortho"],
  },
  {
    id: "sleep",
    title: "Sleep & recovery",
    eyebrow: "Sleep",
    description: "Time asleep and sleep stages show whether recovery is actually happening overnight.",
    categories: ["sleep"],
    metricNames: [],
    keyMetrics: ["Sleep Duration", "Sleep Deep Duration", "Sleep REM Duration"],
    heroMetrics: ["Sleep Duration"],
    media: { image: "/images/sleep-recovery.png", video: "/images/sleep-recovery.mp4", position: "50% 45%", tone: "light" },
    geneticTerms: ["sleep", "insomnia", "caffeine"],
    reportTerms: [],
  },
  {
    id: "activity",
    title: "Activity & movement",
    eyebrow: "Movement",
    description: "Daily movement, workouts, walking quality and environmental exposure.",
    categories: ["activity", "mobility", "environment"],
    metricNames: [],
    keyMetrics: [
      "Flights Climbed",
      "Exercise Time",
      "Six Minute Walk Test Distance",
      "Walking Steadiness",
    ],
    heroMetrics: ["Exercise Time", "Flights Climbed"],
    geneticTerms: ["muscle", "endurance"],
    reportTerms: ["physio", "ortho"],
  },
  {
    id: "nutrition",
    title: "Nutrition",
    eyebrow: "Diet",
    description: "Logged dietary energy and macro/micronutrients.",
    categories: ["nutrition"],
    metricNames: [],
    keyMetrics: [
      "Dietary Energy Consumed",
      "Dietary Protein",
      "Dietary Carbohydrates",
      "Dietary Fat Total",
      "Dietary Fiber",
      "Dietary Sodium",
    ],
    heroMetrics: ["Dietary Energy Consumed"],
    geneticTerms: ["lactose", "celiac", "vitamin"],
    reportTerms: ["nutrition", "diet"],
  },
  {
    id: "respiratory",
    title: "Lungs & breathing",
    eyebrow: "Respiratory",
    description: "Oxygen saturation and breathing rate from wearables and clinical measurements.",
    categories: ["respiratory"],
    metricNames: [],
    keyMetrics: ["Oxygen Saturation", "Respiratory Rate"],
    heroMetrics: ["Oxygen Saturation"],
    geneticTerms: ["asthma", "lung", "pulmonary"],
    reportTerms: ["pulmo", "chest"],
  },
  {
    id: "immune",
    title: "Immune & allergies",
    eyebrow: "Immunity",
    description: "Allergy panels, autoimmune markers, infections and screening markers.",
    categories: ["allergy", "autoimmune", "infectious", "tumor_marker", "other"],
    metricNames: [],
    keyMetrics: [],
    heroMetrics: [],
    geneticTerms: ["immune", "allerg", "autoimmun"],
    reportTerms: ["immuno", "allerg"],
  },
];

export function systemFor(id: string): SystemDef | undefined {
  return SYSTEMS.find((s) => s.id === id);
}

export function metricBelongsTo(
  def: SystemDef,
  metric: { category: string; name: string }
): boolean {
  if (def.metricNames.length > 0) {
    if (def.metricNames.includes(metric.name)) return true;
    if (def.categories.length === 0) return false;
  }
  return def.categories.includes(metric.category);
}

export const CATEGORY_LABELS: Record<string, string> = {
  activity: "Activity",
  allergy: "Allergies",
  autoimmune: "Autoimmune",
  body: "Body",
  cardiac: "Cardiac",
  cardiovascular: "Cardiovascular",
  coagulation: "Coagulation",
  environment: "Environment",
  event: "Events",
  glucose: "Glucose",
  hematology: "Blood counts",
  hormone: "Hormones",
  infectious: "Infectious disease",
  inflammation: "Inflammation",
  lipid: "Lipids",
  liver: "Liver",
  mineral: "Minerals",
  mobility: "Mobility",
  nutrition: "Nutrition",
  other: "Other",
  renal: "Kidney",
  respiratory: "Respiratory",
  sleep: "Sleep",
  thyroid: "Thyroid",
  tumor_marker: "Cancer screening",
  urine: "Urine",
  vitamin: "Vitamins",
};

export function categoryLabel(category: string): string {
  return (
    CATEGORY_LABELS[category] ??
    category
      .split(/[_\s-]+/)
      .filter(Boolean)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(" ")
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/health/systems.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/health/systems.ts src/lib/health/systems.test.ts
git commit -m "feat: add body-system registry for drill-down pages"
```

---

### Task 3: Data loaders — markers, metric detail, metric index (`markers.ts`, `metric.ts`)

**Files:**
- Create: `src/lib/health/markers.ts`
- Create: `src/lib/health/metric.ts`

**Interfaces:**
- Consumes: Task 1 (`series.ts` exports), Task 2 (`categoryLabel`).
- Produces (used by Tasks 5, 6, 7, 8):
  - `type Marker = { date: string; label: string; kind: "report" | "prescription" | "document" | "medication" }`
  - `getMarkers(profileId: string, start: Date | null): Promise<Marker[]>`
  - `type MetricIndexRow = { typeId: string; name: string; category: string; categoryLabel: string; unit: string | null; latestValue: number | null; latestText: string | null; latestDate: string; interpretation: Interpretation; pointCount: number }`
  - `getMetricIndex(profileId: string): Promise<MetricIndexRow[]>`
  - `loadMetricSeries(profileId: string, typeId: string, range: RangeKey): Promise<MetricSeries>`
  - `type MetricHistoryRow = { id: string; observedAt: string; valueNumeric: number | null; valueText: string | null; unit: string | null; referenceLow: number | null; referenceHigh: number | null; interpretation: string; source: string; documentId: string | null; documentName: string | null }`
  - `type MetricDetail = { type: { id: string; canonicalName: string; category: string; categoryLabel: string; unit: string | null; description: string | null }; range: RangeKey; series: MetricSeries; stats: { latest: number; latestDate: string; unit: string | null; min: number; max: number; trend: "rising" | "falling" | "flat" | null } | null; history: MetricHistoryRow[]; historyTotal: number; markers: Marker[] }`
  - `getMetricDetail(profileId: string, typeId: string, range: RangeKey): Promise<MetricDetail | null>` (null when the type id doesn't exist)

- [ ] **Step 1: Implement `src/lib/health/markers.ts`**

(Behavior ported from `loadMarkers` in `src/lib/dashboard.ts:969-1010`, with a cap.)

```ts
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";

export type Marker = {
  date: string;
  label: string;
  kind: "report" | "prescription" | "document" | "medication";
};

const MARKER_DOC_TYPES = [
  "prescription",
  "imaging",
  "specialist_report",
  "discharge_summary",
  "genetic_report",
] as const;

/** Timeline markers (documents + medication changes) for chart overlays. */
export async function getMarkers(profileId: string, start: Date | null): Promise<Marker[]> {
  const docs = await db.query.documents.findMany({
    where: eq(schema.documents.profileId, profileId),
    orderBy: [asc(schema.documents.uploadedAt)],
  });
  const markers: Marker[] = docs
    .filter((d) => (MARKER_DOC_TYPES as readonly string[]).includes(d.documentType))
    .map((d) => ({
      date: (d.documentDate ? new Date(d.documentDate) : d.uploadedAt).toISOString(),
      label:
        d.documentType === "prescription"
          ? "Prescription"
          : d.documentType === "imaging"
            ? "Imaging"
            : d.documentType === "genetic_report"
              ? "Genetic report"
              : "Specialist report",
      kind: d.documentType === "prescription" ? "prescription" : "report",
    }));

  const medEvents = await db.query.medicationEvents.findMany({
    where: eq(schema.medicationEvents.profileId, profileId),
    orderBy: [asc(schema.medicationEvents.eventTime)],
  });
  for (const m of medEvents) {
    if (m.eventType === "started" || m.eventType === "stopped" || m.eventType === "prescribed") {
      markers.push({
        date: m.eventTime.toISOString(),
        label: `${m.nameText} ${m.eventType}`,
        kind: "medication",
      });
    }
  }

  const inRange = markers
    .filter((m) => !start || new Date(m.date) >= start)
    .sort((a, b) => a.date.localeCompare(b.date));

  // Charts get unreadable past ~20 rules; keep medications first, then reports.
  if (inRange.length <= 20) return inRange;
  const meds = inRange.filter((m) => m.kind === "medication");
  const rest = inRange.filter((m) => m.kind !== "medication");
  return [...meds, ...rest].slice(0, 20).sort((a, b) => a.date.localeCompare(b.date));
}
```

- [ ] **Step 2: Implement `src/lib/health/metric.ts`**

```ts
import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { getMarkers, type Marker } from "./markers";
import { categoryLabel } from "./systems";
import {
  downsampleEven,
  MAX_RAW_POINTS,
  rangeStart,
  rawSeries,
  rollupPeriodFor,
  rollupSeries,
  shouldUseRollups,
  trendOf,
  type Interpretation,
  type MetricSeries,
  type RangeKey,
  type RollupBucketRow,
} from "./series";

export type MetricIndexRow = {
  typeId: string;
  name: string;
  category: string;
  categoryLabel: string;
  unit: string | null;
  latestValue: number | null;
  latestText: string | null;
  latestDate: string;
  interpretation: Interpretation;
  pointCount: number;
};

/** Latest confirmed value + total count for every metric type with data. */
export async function getMetricIndex(profileId: string): Promise<MetricIndexRow[]> {
  const result = await db.execute(sql`
    select distinct on (o.observation_type_id)
      ot.id as type_id,
      ot.canonical_name as name,
      ot.category as category,
      coalesce(o.unit, ot.normal_unit) as unit,
      o.value_numeric as latest_value,
      o.value_text as latest_text,
      o.observed_at as latest_date,
      o.interpretation as interpretation,
      count(*) over (partition by o.observation_type_id)::int as point_count
    from observations o
    join observation_types ot on ot.id = o.observation_type_id
    where o.profile_id = ${profileId} and o.status = 'confirmed'
    order by o.observation_type_id, o.observed_at desc
  `);
  const rows = result.rows as Array<{
    type_id: string;
    name: string;
    category: string;
    unit: string | null;
    latest_value: number | null;
    latest_text: string | null;
    latest_date: Date;
    interpretation: Interpretation;
    point_count: number;
  }>;
  return rows
    .map((r) => ({
      typeId: r.type_id,
      name: r.name,
      category: r.category,
      categoryLabel: categoryLabel(r.category),
      unit: r.unit,
      latestValue: r.latest_value,
      latestText: r.latest_text,
      latestDate: new Date(r.latest_date).toISOString(),
      interpretation: r.interpretation,
      pointCount: Number(r.point_count),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

type RawRow = {
  observedAt: Date;
  valueNumeric: number | null;
  referenceLow: number | null;
  referenceHigh: number | null;
  interpretation: Interpretation;
};

async function loadRawRows(profileId: string, typeId: string, start: Date | null) {
  const conditions = [
    eq(schema.observations.profileId, profileId),
    eq(schema.observations.observationTypeId, typeId),
    eq(schema.observations.status, "confirmed"),
  ];
  if (start) conditions.push(gte(schema.observations.observedAt, start));
  return db
    .select({
      observedAt: schema.observations.observedAt,
      valueNumeric: schema.observations.valueNumeric,
      referenceLow: schema.observations.referenceLow,
      referenceHigh: schema.observations.referenceHigh,
      interpretation: schema.observations.interpretation,
    })
    .from(schema.observations)
    .where(and(...conditions))
    .orderBy(asc(schema.observations.observedAt));
}

async function loadRollupBuckets(
  profileId: string,
  typeId: string,
  start: Date | null,
  period: "day" | "week" | "month"
): Promise<RollupBucketRow[]> {
  // Only day rollups exist; week/month buckets are computed here with
  // date_trunc. Averages are weighted by source_observation_count so a day
  // with 40 readings counts more than a day with 2.
  const result = await db.execute(sql`
    select
      date_trunc(${period}, period_start) as bucket,
      sum(case when aggregation = 'daily_avg' then value_numeric * greatest(source_observation_count, 1) end)
        / nullif(sum(case when aggregation = 'daily_avg' then greatest(source_observation_count, 1) end), 0) as avg_value,
      sum(case when aggregation = 'daily_sum' then value_numeric end) as sum_value,
      min(case when aggregation = 'min' then value_numeric end) as min_value,
      max(case when aggregation = 'max' then value_numeric end) as max_value,
      coalesce(sum(case when aggregation in ('daily_avg', 'daily_sum') then greatest(source_observation_count, 1) end), 0)::int as source_count
    from health_rollups
    where profile_id = ${profileId}
      and observation_type_id = ${typeId}
      and period = 'day'
      ${start ? sql`and period_start >= ${start}` : sql``}
    group by 1
    order by 1
  `);
  return (result.rows as Array<Record<string, unknown>>).map((r) => ({
    bucket: new Date(r.bucket as string),
    avgValue: r.avg_value == null ? null : Number(r.avg_value),
    sumValue: r.sum_value == null ? null : Number(r.sum_value),
    minValue: r.min_value == null ? null : Number(r.min_value),
    maxValue: r.max_value == null ? null : Number(r.max_value),
    sourceCount: Number(r.source_count),
  }));
}

/** Chart series for one metric — rollup band when dense, raw points when sparse. */
export async function loadMetricSeries(
  profileId: string,
  typeId: string,
  range: RangeKey
): Promise<MetricSeries> {
  const start = rangeStart(range);
  const raw = (await loadRawRows(profileId, typeId, start)).filter(
    (r): r is RawRow & { valueNumeric: number } => r.valueNumeric != null
  );

  if (shouldUseRollups(raw.length)) {
    const buckets = await loadRollupBuckets(profileId, typeId, start, rollupPeriodFor(range));
    const series = rollupSeries(buckets, rollupPeriodFor(range));
    if (series.points.length > 0) return series;
    // No rollups for this metric — fall back to evenly sampled raw points.
    const sampled = downsampleEven(raw, MAX_RAW_POINTS);
    const fallback = rawSeries(sampled);
    return {
      ...fallback,
      caption: `Sampled ${sampled.length.toLocaleString("en-IN")} of ${raw.length.toLocaleString("en-IN")} readings`,
    };
  }
  return rawSeries(raw);
}

export type MetricHistoryRow = {
  id: string;
  observedAt: string;
  valueNumeric: number | null;
  valueText: string | null;
  unit: string | null;
  referenceLow: number | null;
  referenceHigh: number | null;
  interpretation: string;
  source: string;
  documentId: string | null;
  documentName: string | null;
};

export type MetricDetail = {
  type: {
    id: string;
    canonicalName: string;
    category: string;
    categoryLabel: string;
    unit: string | null;
    description: string | null;
  };
  range: RangeKey;
  series: MetricSeries;
  stats: {
    latest: number;
    latestDate: string;
    unit: string | null;
    min: number;
    max: number;
    trend: "rising" | "falling" | "flat" | null;
  } | null;
  history: MetricHistoryRow[];
  historyTotal: number;
  markers: Marker[];
};

const HISTORY_LIMIT = 200;

export async function getMetricDetail(
  profileId: string,
  typeId: string,
  range: RangeKey
): Promise<MetricDetail | null> {
  const type = await db.query.observationTypes.findFirst({
    where: eq(schema.observationTypes.id, typeId),
  });
  if (!type) return null;

  const start = rangeStart(range);
  const series = await loadMetricSeries(profileId, typeId, range);

  const historyConditions = [
    eq(schema.observations.profileId, profileId),
    eq(schema.observations.observationTypeId, typeId),
    eq(schema.observations.status, "confirmed"),
  ];
  if (start) historyConditions.push(gte(schema.observations.observedAt, start));

  const [{ total }] = (await db
    .select({ total: sql<number>`count(*)::int` })
    .from(schema.observations)
    .where(and(...historyConditions))) as Array<{ total: number }>;

  const historyRows = await db
    .select({
      id: schema.observations.id,
      observedAt: schema.observations.observedAt,
      valueNumeric: schema.observations.valueNumeric,
      valueText: schema.observations.valueText,
      unit: schema.observations.unit,
      referenceLow: schema.observations.referenceLow,
      referenceHigh: schema.observations.referenceHigh,
      interpretation: schema.observations.interpretation,
      source: schema.observations.source,
      documentId: schema.observations.documentId,
      documentName: schema.documents.originalFilename,
    })
    .from(schema.observations)
    .leftJoin(schema.documents, eq(schema.observations.documentId, schema.documents.id))
    .where(and(...historyConditions))
    .orderBy(desc(schema.observations.observedAt))
    .limit(HISTORY_LIMIT);

  const numericPoints = series.points.map((p) => p.value);
  const latestHistory = historyRows.find((r) => r.valueNumeric != null);
  const stats =
    latestHistory && numericPoints.length > 0
      ? {
          latest: latestHistory.valueNumeric!,
          latestDate: latestHistory.observedAt.toISOString(),
          unit: latestHistory.unit ?? type.normalUnit,
          min: Math.min(...numericPoints),
          max: Math.max(...numericPoints),
          trend: trendOf(numericPoints),
        }
      : null;

  return {
    type: {
      id: type.id,
      canonicalName: type.canonicalName,
      category: type.category,
      categoryLabel: categoryLabel(type.category),
      unit: type.normalUnit,
      description: type.description,
    },
    range,
    series,
    stats,
    history: historyRows.map((r) => ({ ...r, observedAt: r.observedAt.toISOString() })),
    historyTotal: total,
    markers: await getMarkers(profileId, start),
  };
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in `src/lib/health/`.

- [ ] **Step 4: Verify against real data**

Create a throwaway script `scratch-verify.mjs` is NOT needed — verify with psql instead. The weighted HRV average for a known week must match the loader's SQL:

```bash
/Applications/Postgres.app/Contents/Versions/17/bin/psql "$DATABASE_URL" -c "
select date_trunc('week', period_start) as bucket,
  sum(case when aggregation='daily_avg' then value_numeric * greatest(source_observation_count,1) end)
  / nullif(sum(case when aggregation='daily_avg' then greatest(source_observation_count,1) end),0) as avg_value
from health_rollups hr
join observation_types ot on ot.id = hr.observation_type_id
where ot.canonical_name = 'HRV' and period='day'
group by 1 order by 1 desc limit 3;"
```

Expected: three rows with plausible HRV averages (roughly 20–120 ms), no SQL errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/health/markers.ts src/lib/health/metric.ts
git commit -m "feat: add metric detail and index data loaders with rollup bucketing"
```

---

### Task 4: Reusable metric chart component

**Files:**
- Create: `src/components/health/metric-chart.tsx`

**Interfaces:**
- Consumes: `MetricSeries`, `SeriesPoint` from Task 1; `Marker` from Task 3.
- Produces (used by Tasks 5, 7): `<MetricChart series unit markers height />` — client component. Renders min–max band (rollup mode), avg/value line, reference band, vertical marker rules. Assumes `series.points.length >= 2` (callers render a value card otherwise).

- [ ] **Step 1: Implement `src/components/health/metric-chart.tsx`**

```tsx
"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Marker } from "@/lib/health/markers";
import type { MetricSeries } from "@/lib/health/series";

function fmt(value: number) {
  const abs = Math.abs(value);
  return Number(value.toFixed(abs > 0 && abs < 10 ? 1 : 0)).toLocaleString("en-IN");
}

function fmtDate(t: number, withYear = true) {
  return new Date(t).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "2-digit" } : {}),
  });
}

export function MetricChart({
  series,
  unit,
  markers = [],
  height = 320,
}: {
  series: MetricSeries;
  unit: string | null;
  markers?: Marker[];
  height?: number;
}) {
  const data = series.points.map((p) => ({
    t: new Date(p.date).getTime(),
    value: p.value,
    band: p.min != null && p.max != null ? [p.min, p.max] : undefined,
    interpretation: p.interpretation,
  }));
  const first = data[0]?.t ?? 0;
  const last = data[data.length - 1]?.t ?? 1;
  const refPoint = series.points.find((p) => p.referenceLow != null || p.referenceHigh != null);
  const hasBand = data.some((d) => d.band);
  const markerTimes = markers
    .map((m) => ({ ...m, t: new Date(m.date).getTime() }))
    .filter((m) => m.t >= first && m.t <= last);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 10, right: 12, bottom: 4, left: 0 }}>
        <CartesianGrid stroke="currentColor" strokeDasharray="3 3" strokeOpacity={0.14} vertical={false} />
        <XAxis
          dataKey="t"
          type="number"
          domain={[first, last]}
          tickFormatter={(t) => fmtDate(Number(t))}
          tick={{ fill: "currentColor", fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: "currentColor", strokeOpacity: 0.24 }}
          tickCount={6}
        />
        <YAxis
          domain={["auto", "auto"]}
          tickFormatter={(v) => fmt(Number(v))}
          tick={{ fill: "currentColor", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={44}
        />
        <Tooltip
          formatter={(value, name) => {
            if (name === "band" && Array.isArray(value)) {
              return [`${fmt(value[0])} – ${fmt(value[1])}${unit ? ` ${unit}` : ""}`, "Range"];
            }
            return [`${fmt(Number(value))}${unit ? ` ${unit}` : ""}`, series.mode === "rollup" ? "Average" : "Value"];
          }}
          labelFormatter={(t) =>
            new Date(Number(t)).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
          }
          contentStyle={{
            fontSize: 12,
            borderRadius: 8,
            borderColor: "var(--border)",
            boxShadow: "0 12px 30px oklch(0.19 0.035 252 / 12%)",
          }}
        />
        {refPoint?.referenceLow != null && refPoint?.referenceHigh != null && (
          <ReferenceArea
            y1={refPoint.referenceLow}
            y2={refPoint.referenceHigh}
            fill="var(--success)"
            fillOpacity={0.08}
            ifOverflow="extendDomain"
          />
        )}
        {refPoint?.referenceHigh != null && (
          <ReferenceLine y={refPoint.referenceHigh} stroke="#ef4444" strokeDasharray="4 3" strokeOpacity={0.45} />
        )}
        {refPoint?.referenceLow != null && (
          <ReferenceLine y={refPoint.referenceLow} stroke="#3b82f6" strokeDasharray="4 3" strokeOpacity={0.35} />
        )}
        {markerTimes.map((m, i) => (
          <ReferenceLine
            key={`${m.date}-${i}`}
            x={m.t}
            stroke="var(--primary)"
            strokeDasharray="2 4"
            strokeOpacity={0.5}
          />
        ))}
        {hasBand && (
          <Area
            dataKey="band"
            stroke="none"
            fill="var(--primary)"
            fillOpacity={0.14}
            isAnimationActive={false}
          />
        )}
        <Line
          type="monotone"
          dataKey="value"
          stroke="var(--primary)"
          strokeWidth={2.5}
          dot={series.mode === "raw" ? { r: 3.5, strokeWidth: 2, fill: "var(--card)" } : false}
          activeDot={{ r: 5 }}
          isAnimationActive={series.points.length <= 60}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (If Recharts rejects the array `band` dataKey typing, cast the `Area` props: `dataKey={"band" as never}` is NOT acceptable — instead type data points as `{ band?: [number, number] }`, which Recharts 3 accepts for range areas.)

- [ ] **Step 3: Commit**

```bash
git add src/components/health/metric-chart.tsx
git commit -m "feat: add rollup-aware metric chart component"
```

---

### Task 5: Metric detail page `/metrics/[typeId]`

**Files:**
- Create: `src/app/(app)/metrics/[typeId]/page.tsx`
- Create: `src/app/(app)/metrics/[typeId]/metric-view.tsx`

**Interfaces:**
- Consumes: `getMetricDetail`, `MetricDetail`, `MetricHistoryRow` (Task 3); `MetricChart` (Task 4); `RANGES`, `RANGE_LABELS`, `parseRange` (Task 1); existing APIs `POST /api/observations` and `DELETE /api/observations/[id]`.
- Produces: route `/metrics/[typeId]?range=…` that Tasks 6–9 link to.

- [ ] **Step 1: Implement the server page `src/app/(app)/metrics/[typeId]/page.tsx`**

```tsx
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getActiveProfile } from "@/lib/active-profile";
import { getMetricDetail } from "@/lib/health/metric";
import { parseRange } from "@/lib/health/series";
import { MetricView } from "./metric-view";

export default async function MetricPage({
  params,
  searchParams,
}: {
  params: Promise<{ typeId: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { profile } = await getActiveProfile(session.user.id);
  if (!profile) redirect("/profiles");

  const { typeId } = await params;
  const { range: rangeParam } = await searchParams;
  const detail = await getMetricDetail(profile.id, typeId, parseRange(rangeParam));
  if (!detail) notFound();

  return <MetricView profileId={profile.id} detail={detail} />;
}
```

- [ ] **Step 2: Implement the client view `src/app/(app)/metrics/[typeId]/metric-view.tsx`**

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, FileText, Loader2, Pill, Plus, Stethoscope, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/mascot";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MetricChart } from "@/components/health/metric-chart";
import { RANGES, RANGE_LABELS } from "@/lib/health/series";
import type { MetricDetail } from "@/lib/health/metric";
import { cn } from "@/lib/utils";

function interpBadge(interpretation: string) {
  if (interpretation === "high" || interpretation === "critical") {
    return <Badge className="bg-destructive/10 text-destructive">{interpretation}</Badge>;
  }
  if (interpretation === "low") {
    return <Badge className="bg-primary/10 text-primary">low</Badge>;
  }
  if (interpretation === "normal") {
    return (
      <Badge className="bg-[var(--success)]/15 text-[color-mix(in_oklch,var(--success),black_28%)]">
        normal
      </Badge>
    );
  }
  return null;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function MetricView({ profileId, detail }: { profileId: string; detail: MetricDetail }) {
  const router = useRouter();
  const pathname = usePathname();
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [newValue, setNewValue] = useState("");
  const [newUnit, setNewUnit] = useState(detail.type.unit ?? "");
  const [newDate, setNewDate] = useState(new Date().toISOString().slice(0, 10));

  async function addValue() {
    if (!newValue) return;
    setSaving(true);
    try {
      const res = await fetch("/api/observations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId,
          observationTypeId: detail.type.id,
          observedAt: new Date(newDate).toISOString(),
          valueNumeric: Number(newValue),
          unit: newUnit || undefined,
        }),
      });
      if (res.ok) {
        setAddOpen(false);
        setNewValue("");
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  async function deleteRow(id: string) {
    if (!confirm("Delete this value? This cannot be undone.")) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/observations/${id}`, { method: "DELETE" });
      if (res.ok) router.refresh();
    } finally {
      setDeleting(null);
    }
  }

  const { series, stats, markers } = detail;
  const singlePoint = series.points.length < 2;

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/metrics"
            className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> All measurements
          </Link>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-semibold">{detail.type.canonicalName}</h1>
            {stats && interpBadge(detail.history[0]?.interpretation ?? "unknown")}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {detail.type.categoryLabel}
            {detail.type.description ? ` · ${detail.type.description}` : ""}
          </p>
        </div>
        <div className="scrollbar-none flex max-w-full overflow-x-auto rounded-lg border bg-card/80 p-1 shadow-xs">
          {RANGES.map((r) => (
            <Link
              key={r}
              href={`${pathname}?range=${r}`}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-semibold transition-all",
                detail.range === r
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {RANGE_LABELS[r]}
            </Link>
          ))}
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card className="py-3">
            <CardContent className="px-4">
              <p className="text-xs text-muted-foreground">Latest</p>
              <p className="text-2xl font-semibold tabular-nums">
                {stats.latest.toLocaleString("en-IN")}
                <span className="ml-1 text-sm font-normal text-muted-foreground">{stats.unit}</span>
              </p>
              <p className="text-xs text-muted-foreground">{fmtDate(stats.latestDate)}</p>
            </CardContent>
          </Card>
          <Card className="py-3">
            <CardContent className="px-4">
              <p className="text-xs text-muted-foreground">Lowest in range</p>
              <p className="text-2xl font-semibold tabular-nums">{stats.min.toLocaleString("en-IN")}</p>
            </CardContent>
          </Card>
          <Card className="py-3">
            <CardContent className="px-4">
              <p className="text-xs text-muted-foreground">Highest in range</p>
              <p className="text-2xl font-semibold tabular-nums">{stats.max.toLocaleString("en-IN")}</p>
            </CardContent>
          </Card>
          <Card className="py-3">
            <CardContent className="px-4">
              <p className="text-xs text-muted-foreground">Trend</p>
              <p className="text-2xl font-semibold capitalize">{stats.trend ?? "–"}</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
            <span>History</span>
            <span className="text-xs font-normal text-muted-foreground">{series.caption}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {series.points.length === 0 ? (
            <EmptyState
              mood="thinking"
              title="No confirmed values in this range"
              description="Try a longer range, or add a value below."
            />
          ) : singlePoint ? (
            <div className="grid gap-1 rounded-lg border bg-muted/30 p-6 text-center">
              <p className="text-4xl font-semibold tabular-nums">
                {series.points[0].value.toLocaleString("en-IN")}
                <span className="ml-1 text-base font-normal text-muted-foreground">
                  {detail.type.unit}
                </span>
              </p>
              <p className="text-sm text-muted-foreground">
                {fmtDate(series.points[0].date)}
                {series.points[0].referenceHigh != null &&
                  ` · reference ${series.points[0].referenceLow ?? 0}–${series.points[0].referenceHigh}`}
              </p>
              <p className="text-xs text-muted-foreground">
                Only one value on record — a trend needs at least two.
              </p>
            </div>
          ) : (
            <MetricChart series={series} unit={detail.type.unit} markers={markers} />
          )}
          {markers.length > 0 && series.points.length >= 2 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {markers.map((m, i) => (
                <span
                  key={`${m.date}-${i}`}
                  className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground"
                >
                  {m.kind === "medication" || m.kind === "prescription" ? (
                    <Pill className="size-3" />
                  ) : (
                    <Stethoscope className="size-3" />
                  )}
                  {fmtDate(m.date)} · {m.label}
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="flex items-center justify-between text-base">
            <span>
              Values{" "}
              <span className="text-xs font-normal text-muted-foreground">
                {detail.historyTotal > detail.history.length
                  ? `latest ${detail.history.length} of ${detail.historyTotal.toLocaleString("en-IN")}`
                  : `${detail.historyTotal}`}
              </span>
            </span>
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline">
                  <Plus className="size-4" /> Add value
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add {detail.type.canonicalName} value</DialogTitle>
                </DialogHeader>
                <div className="grid gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="metric-value">Value</Label>
                    <Input
                      id="metric-value"
                      type="number"
                      value={newValue}
                      onChange={(e) => setNewValue(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="metric-unit">Unit</Label>
                    <Input id="metric-unit" value={newUnit} onChange={(e) => setNewUnit(e.target.value)} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="metric-date">Date</Label>
                    <Input
                      id="metric-date"
                      type="date"
                      value={newDate}
                      onChange={(e) => setNewDate(e.target.value)}
                    />
                  </div>
                  <Button disabled={saving || !newValue} onClick={addValue}>
                    {saving && <Loader2 className="size-4 animate-spin" />} Save
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Source</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {detail.history.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap tabular-nums">{fmtDate(row.observedAt)}</TableCell>
                  <TableCell className="font-medium tabular-nums">
                    {row.valueNumeric != null ? row.valueNumeric.toLocaleString("en-IN") : row.valueText}
                    {row.unit && <span className="ml-1 text-xs text-muted-foreground">{row.unit}</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">
                    {row.referenceHigh != null ? `${row.referenceLow ?? 0}–${row.referenceHigh}` : "–"}
                  </TableCell>
                  <TableCell>{interpBadge(row.interpretation)}</TableCell>
                  <TableCell>
                    {row.documentId ? (
                      <Link
                        href={`/documents/${row.documentId}/review`}
                        className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
                      >
                        <FileText className="size-3.5" />
                        <span className="max-w-40 truncate">{row.documentName ?? "Document"}</span>
                      </Link>
                    ) : (
                      <span className="text-muted-foreground capitalize">{row.source.replace("_", " ")}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="icon"
                      variant="ghost"
                      disabled={deleting === row.id}
                      onClick={() => deleteRow(row.id)}
                      aria-label="Delete value"
                    >
                      {deleting === row.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4 text-muted-foreground" />
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Build and verify in preview**

Run: `npx tsc --noEmit && npm run lint`
Then start the dev server (preview tools), log in (`surekap@gmail.com` / `hearth-dev` against local DB), and check:
- `/metrics/<ALT-type-uuid>` — sparse chart with dots, red reference line, history table with document links. Get the uuid: `psql -c "select id from observation_types where canonical_name='ALT'"`.
- `/metrics/<HRV-type-uuid>?range=1y` — band chart, caption says "Weekly averages from … readings".
- A single-point metric (e.g. an allergy panel row) shows the value card, no line.
- Add-value dialog inserts and refreshes; delete removes a row.

Expected: all four behaviors verified, no console errors.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/metrics/"
git commit -m "feat: add metric detail page with rollup-aware chart and history"
```

---

### Task 6: Measurements index `/metrics`, fold Labs, rename nav

**Files:**
- Create: `src/app/(app)/metrics/page.tsx`
- Create: `src/app/(app)/metrics/metrics-index-view.tsx`
- Modify: `src/app/(app)/labs/page.tsx` (replace body with redirect)
- Delete: `src/app/(app)/labs/labs-view.tsx`
- Modify: `src/components/shell/nav.tsx:21` (Labs → Measurements)

**Interfaces:**
- Consumes: `getMetricIndex`, `MetricIndexRow` (Task 3); existing `POST /api/observations`.
- Produces: route `/metrics` (linked from Tasks 5, 7, 8, 9); `/labs` → permanent redirect.

- [ ] **Step 1: Implement `src/app/(app)/metrics/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { asc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getActiveProfile } from "@/lib/active-profile";
import { db, schema } from "@/db";
import { getMetricIndex } from "@/lib/health/metric";
import { MetricsIndexView } from "./metrics-index-view";

export default async function MetricsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { profile } = await getActiveProfile(session.user.id);
  if (!profile) redirect("/profiles");

  const [index, allTypes] = await Promise.all([
    getMetricIndex(profile.id),
    db.query.observationTypes.findMany({
      orderBy: [asc(schema.observationTypes.canonicalName)],
      columns: { id: true, canonicalName: true, category: true, normalUnit: true },
    }),
  ]);

  return <MetricsIndexView profileId={profile.id} index={index} allTypes={allTypes} />;
}
```

- [ ] **Step 2: Implement `src/app/(app)/metrics/metrics-index-view.tsx`**

```tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Loader2, Plus, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/mascot";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MetricIndexRow } from "@/lib/health/metric";

type ObsType = { id: string; canonicalName: string; category: string; normalUnit: string | null };

function interpBadge(interpretation: string) {
  if (interpretation === "high" || interpretation === "critical") {
    return <Badge className="bg-destructive/10 text-destructive">{interpretation}</Badge>;
  }
  if (interpretation === "low") return <Badge className="bg-primary/10 text-primary">low</Badge>;
  return null;
}

export function MetricsIndexView({
  profileId,
  index,
  allTypes,
}: {
  profileId: string;
  index: MetricIndexRow[];
  allTypes: ObsType[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newTypeId, setNewTypeId] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newUnit, setNewUnit] = useState("");
  const [newDate, setNewDate] = useState(new Date().toISOString().slice(0, 10));

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = q
      ? index.filter(
          (r) => r.name.toLowerCase().includes(q) || r.categoryLabel.toLowerCase().includes(q)
        )
      : index;
    const byCategory = new Map<string, MetricIndexRow[]>();
    for (const row of rows) {
      const list = byCategory.get(row.categoryLabel) ?? [];
      list.push(row);
      byCategory.set(row.categoryLabel, list);
    }
    return [...byCategory.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [index, query]);

  async function addValue() {
    if (!newTypeId || !newValue) return;
    setSaving(true);
    try {
      const res = await fetch("/api/observations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId,
          observationTypeId: newTypeId,
          observedAt: new Date(newDate).toISOString(),
          valueNumeric: Number(newValue),
          unit: newUnit || undefined,
        }),
      });
      if (res.ok) {
        setAddOpen(false);
        setNewValue("");
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Badge className="mb-2 bg-accent text-accent-foreground" variant="secondary">
            Measurements
          </Badge>
          <h1 className="text-3xl font-semibold">All measurements</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every confirmed value, searchable. Open any measurement for its full history.
          </p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="size-4" /> Add value
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add a value</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="add-type">Measurement</Label>
                <select
                  id="add-type"
                  className="h-9 rounded-md border bg-transparent px-3 text-sm"
                  value={newTypeId}
                  onChange={(e) => {
                    setNewTypeId(e.target.value);
                    const t = allTypes.find((x) => x.id === e.target.value);
                    if (t?.normalUnit) setNewUnit(t.normalUnit);
                  }}
                >
                  <option value="">Select…</option>
                  {allTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.canonicalName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="add-value">Value</Label>
                <Input id="add-value" type="number" value={newValue} onChange={(e) => setNewValue(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="add-unit">Unit</Label>
                <Input id="add-unit" value={newUnit} onChange={(e) => setNewUnit(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="add-date">Date</Label>
                <Input id="add-date" type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
              </div>
              <Button disabled={saving || !newTypeId || !newValue} onClick={addValue}>
                {saving && <Loader2 className="size-4 animate-spin" />} Save
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search measurements or categories…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {groups.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              mood="thinking"
              title={query ? "No matches" : "No confirmed values yet"}
              description={
                query
                  ? "Try a different search term."
                  : "Upload and confirm a report to start building this list."
              }
            />
          </CardContent>
        </Card>
      ) : (
        groups.map(([label, rows]) => (
          <section key={label} className="grid gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {label}
            </h2>
            <Card className="py-1">
              <CardContent className="divide-y px-0">
                {rows.map((row) => (
                  <Link
                    key={row.typeId}
                    href={`/metrics/${row.typeId}`}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-muted/40"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{row.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {new Date(row.latestDate).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}{" "}
                        · {row.pointCount.toLocaleString("en-IN")} value{row.pointCount === 1 ? "" : "s"}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {interpBadge(row.interpretation)}
                      <span className="text-sm font-semibold tabular-nums">
                        {row.latestValue != null ? row.latestValue.toLocaleString("en-IN") : row.latestText}
                        {row.unit && (
                          <span className="ml-1 text-xs font-normal text-muted-foreground">{row.unit}</span>
                        )}
                      </span>
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </span>
                  </Link>
                ))}
              </CardContent>
            </Card>
          </section>
        ))
      )}
    </div>
  );
}
```

- [ ] **Step 3: Fold Labs**

Replace the entire contents of `src/app/(app)/labs/page.tsx` with:

```tsx
import { redirect } from "next/navigation";

export default function LabsPage() {
  redirect("/metrics");
}
```

Delete `src/app/(app)/labs/labs-view.tsx`:

```bash
git rm "src/app/(app)/labs/labs-view.tsx"
```

- [ ] **Step 4: Rename nav item**

In `src/components/shell/nav.tsx`, change line 21 from:

```tsx
  { href: "/labs", label: "Labs", icon: FlaskConical },
```

to:

```tsx
  { href: "/metrics", label: "Measurements", icon: FlaskConical },
```

Check the same file for a mobile bottom-nav item list; if `/labs` appears again, update it identically.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npm run lint && npx vitest run`
In preview: `/metrics` lists grouped measurements with search working; clicking a row opens the detail page; `/labs` redirects to `/metrics`; nav shows "Measurements".
Expected: all pass, no orphan imports of `labs-view`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add measurements index, fold labs into metrics drill-down"
```

---

### Task 7: System data loader + system pages `/dashboard/[system]`

**Files:**
- Create: `src/lib/health/system.ts`
- Create: `src/app/(app)/dashboard/[system]/page.tsx`
- Create: `src/app/(app)/dashboard/[system]/system-view.tsx`
- Create: `src/components/health/sparkline.tsx`

**Interfaces:**
- Consumes: Tasks 1–4 exports (`systemFor`, `metricBelongsTo`, `SystemDef`, `getMetricIndex`, `loadMetricSeries`, `getMarkers`, `attentionState`, `parseRange`, `MetricChart`).
- Produces:
  - `type SystemMetricRow = MetricIndexRow & { spark: number[] }`
  - `type SystemPageData = { def: SystemDef; range: RangeKey; tone: "danger" | "success" | "neutral"; hero: { name: string; value: string; typeId: string } | null; keyCharts: Array<{ typeId: string; name: string; unit: string | null; series: MetricSeries }>; metrics: SystemMetricRow[]; reports: Array<{ id: string; documentId: string; specialty: string | null; reportType: string; reportDate: string | null; summary: string | null; followUpRecommended: boolean }>; genetics: Array<{ id: string; conditionName: string; riskLevel: string; summary: string | null }>; markers: Marker[] }`
  - `getSystemData(profileId: string, systemId: string, range: RangeKey): Promise<SystemPageData | null>`
  - `<Sparkline values />` tiny inline SVG (reused by Task 8).

- [ ] **Step 1: Implement `src/lib/health/system.ts`**

```ts
import { desc, eq, ilike, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { getMarkers, type Marker } from "./markers";
import { getMetricIndex, loadMetricSeries, type MetricIndexRow } from "./metric";
import { attentionState, rangeStart, type MetricSeries, type RangeKey } from "./series";
import { metricBelongsTo, systemFor, type SystemDef } from "./systems";

export type SystemMetricRow = MetricIndexRow & { spark: number[] };

export type SystemPageData = {
  def: SystemDef;
  range: RangeKey;
  tone: "danger" | "success" | "neutral";
  hero: { name: string; value: string; typeId: string } | null;
  keyCharts: Array<{ typeId: string; name: string; unit: string | null; series: MetricSeries }>;
  metrics: SystemMetricRow[];
  reports: Array<{
    id: string;
    documentId: string;
    specialty: string | null;
    reportType: string;
    reportDate: string | null;
    summary: string | null;
    followUpRecommended: boolean;
  }>;
  genetics: Array<{ id: string; conditionName: string; riskLevel: string; summary: string | null }>;
  markers: Marker[];
};

const SPARK_POINTS = 12;
const KEY_CHART_LIMIT = 6;

async function loadSparks(profileId: string, typeIds: string[]) {
  if (typeIds.length === 0) return new Map<string, number[]>();
  const result = await db.execute(sql`
    select observation_type_id, value_numeric from (
      select o.observation_type_id, o.observed_at, o.value_numeric,
        row_number() over (partition by o.observation_type_id order by o.observed_at desc) as rn
      from observations o
      where o.profile_id = ${profileId} and o.status = 'confirmed'
        and o.value_numeric is not null
        and o.observation_type_id in ${sql.raw(`(${typeIds.map((id) => `'${id}'`).join(",")})`)}
    ) t where rn <= ${SPARK_POINTS}
    order by observation_type_id, observed_at asc
  `);
  const map = new Map<string, number[]>();
  for (const row of result.rows as Array<{ observation_type_id: string; value_numeric: number }>) {
    const list = map.get(row.observation_type_id) ?? [];
    list.push(Number(row.value_numeric));
    map.set(row.observation_type_id, list);
  }
  return map;
}

export async function getSystemData(
  profileId: string,
  systemId: string,
  range: RangeKey
): Promise<SystemPageData | null> {
  const def = systemFor(systemId);
  if (!def) return null;

  const index = await getMetricIndex(profileId);
  const members = index.filter((row) => metricBelongsTo(def, { category: row.category, name: row.name }));
  if (members.length === 0) return null;

  const sparks = await loadSparks(profileId, members.map((m) => m.typeId));
  const metrics: SystemMetricRow[] = members.map((m) => ({ ...m, spark: sparks.get(m.typeId) ?? [] }));

  const byName = new Map(members.map((m) => [m.name, m]));
  const keyRows = def.keyMetrics.map((name) => byName.get(name)).filter(Boolean) as MetricIndexRow[];
  const chartRows = (keyRows.length > 0 ? keyRows : members.slice(0, KEY_CHART_LIMIT)).slice(0, KEY_CHART_LIMIT);
  const keyCharts = await Promise.all(
    chartRows.map(async (row) => ({
      typeId: row.typeId,
      name: row.name,
      unit: row.unit,
      series: await loadMetricSeries(profileId, row.typeId, range),
    }))
  );

  const heroRow =
    def.heroMetrics.map((name) => byName.get(name)).find((r) => r && r.latestValue != null) ??
    members.find((m) => m.latestValue != null) ??
    null;
  const hero = heroRow
    ? {
        name: heroRow.name,
        typeId: heroRow.typeId,
        value: `${heroRow.latestValue!.toLocaleString("en-IN")}${heroRow.unit ? ` ${heroRow.unit}` : ""}`,
      }
    : null;

  const anyAttention = members.some(
    (m) =>
      attentionState({ interpretation: m.interpretation, observedAt: new Date(m.latestDate) }) ===
      "attention"
  );
  const tone: SystemPageData["tone"] = anyAttention ? "danger" : hero ? "success" : "neutral";

  const reports =
    def.reportTerms.length > 0
      ? await db
          .select({
            id: schema.clinicalReports.id,
            documentId: schema.clinicalReports.documentId,
            specialty: schema.clinicalReports.specialty,
            reportType: schema.clinicalReports.reportType,
            reportDate: schema.clinicalReports.reportDate,
            summary: schema.clinicalReports.summary,
            followUpRecommended: schema.clinicalReports.followUpRecommended,
          })
          .from(schema.clinicalReports)
          .where(
            sql`${schema.clinicalReports.profileId} = ${profileId} and (${or(
              ...def.reportTerms.map((t) => ilike(schema.clinicalReports.specialty, `%${t}%`))
            )})`
          )
          .orderBy(desc(schema.clinicalReports.createdAt))
          .limit(10)
      : [];

  const genetics =
    def.geneticTerms.length > 0
      ? await db
          .select({
            id: schema.geneticRiskAssessments.id,
            conditionName: schema.geneticRiskAssessments.conditionName,
            riskLevel: schema.geneticRiskAssessments.riskLevel,
            summary: schema.geneticRiskAssessments.summary,
          })
          .from(schema.geneticRiskAssessments)
          .where(
            sql`${schema.geneticRiskAssessments.profileId} = ${profileId} and (${or(
              ...def.geneticTerms.map((t) => ilike(schema.geneticRiskAssessments.conditionName, `%${t}%`))
            )}) and ${schema.geneticRiskAssessments.riskLevel} in ('high', 'medium')`
          )
          .orderBy(desc(schema.geneticRiskAssessments.riskLevel))
          .limit(8)
      : [];

  return {
    def,
    range,
    tone,
    hero,
    keyCharts,
    metrics,
    reports,
    genetics,
    markers: await getMarkers(profileId, rangeStart(range)),
  };
}
```

- [ ] **Step 2: Implement `src/components/health/sparkline.tsx`**

```tsx
export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values
    .map((v, i) => `${(i / (values.length - 1)) * 64},${18 - ((v - min) / span) * 16}`)
    .join(" ");
  return (
    <svg viewBox="0 0 64 20" className={className ?? "h-5 w-16 text-primary"} aria-hidden="true">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
```

- [ ] **Step 3: Implement `src/app/(app)/dashboard/[system]/page.tsx`**

```tsx
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getActiveProfile } from "@/lib/active-profile";
import { getSystemData } from "@/lib/health/system";
import { parseRange } from "@/lib/health/series";
import { SystemView } from "./system-view";

export default async function SystemPage({
  params,
  searchParams,
}: {
  params: Promise<{ system: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { profile } = await getActiveProfile(session.user.id);
  if (!profile) redirect("/profiles");

  const { system } = await params;
  const { range: rangeParam } = await searchParams;
  const data = await getSystemData(profile.id, system, parseRange(rangeParam));
  if (!data) notFound();

  return <SystemView data={data} />;
}
```

- [ ] **Step 4: Implement `src/app/(app)/dashboard/[system]/system-view.tsx`**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, ArrowLeft, ChevronRight, ClipboardList, Dna } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricChart } from "@/components/health/metric-chart";
import { Sparkline } from "@/components/health/sparkline";
import { RANGES, RANGE_LABELS } from "@/lib/health/series";
import type { SystemPageData } from "@/lib/health/system";
import { cn } from "@/lib/utils";

function interpBadge(interpretation: string) {
  if (interpretation === "high" || interpretation === "critical") {
    return <Badge className="bg-destructive/10 text-destructive">{interpretation}</Badge>;
  }
  if (interpretation === "low") return <Badge className="bg-primary/10 text-primary">low</Badge>;
  return null;
}

export function SystemView({ data }: { data: SystemPageData }) {
  const pathname = usePathname();
  const { def, hero } = data;
  const media = def.media;
  const light = media?.tone !== "dark";

  return (
    <div className="grid gap-5">
      <div
        className={cn(
          "relative min-h-64 overflow-hidden rounded-xl border shadow-inner",
          media ? (light ? "bg-slate-100" : "bg-slate-950") : "bg-[linear-gradient(135deg,oklch(0.96_0.025_226),oklch(0.99_0.018_185))] dark:bg-[linear-gradient(135deg,oklch(0.24_0.045_240),oklch(0.18_0.038_252))]"
        )}
      >
        {media?.video ? (
          <video
            aria-hidden="true"
            autoPlay
            loop
            muted
            playsInline
            poster={media.image}
            className="absolute inset-0 size-full object-cover motion-reduce:hidden"
            style={{ objectPosition: media.position }}
          >
            <source src={media.video} type="video/mp4" />
          </video>
        ) : media ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={media.image}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 size-full object-cover"
            style={{ objectPosition: media.position }}
          />
        ) : null}
        {media?.video && (
          // Reduced-motion users get the poster image instead of the video.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={media.image}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 hidden size-full object-cover motion-reduce:block"
            style={{ objectPosition: media.position }}
          />
        )}
        {media && (
          <div
            className={cn(
              "absolute inset-0",
              light
                ? "bg-[linear-gradient(90deg,rgba(248,250,252,.92),rgba(248,250,252,.55)_45%,rgba(248,250,252,.06))]"
                : "bg-[linear-gradient(90deg,rgba(2,6,23,.85),rgba(2,6,23,.5)_45%,rgba(2,6,23,.15))]"
            )}
          />
        )}
        <div className={cn("relative grid content-between gap-6 p-5 sm:p-6", !light && media && "text-white")}>
          <div>
            <Link
              href="/dashboard"
              className={cn(
                "mb-2 inline-flex items-center gap-1 text-sm font-medium",
                light || !media ? "text-muted-foreground hover:text-foreground" : "text-white/70 hover:text-white"
              )}
            >
              <ArrowLeft className="size-4" /> Overview
            </Link>
            <Badge className="mb-2 block w-fit bg-accent text-accent-foreground" variant="secondary">
              {def.eyebrow}
            </Badge>
            <h1 className="text-3xl font-semibold">{def.title}</h1>
            <p className={cn("mt-1 max-w-xl text-sm", light || !media ? "text-muted-foreground" : "text-white/75")}>
              {def.description}
            </p>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-3">
            {hero && (
              <Link
                href={`/metrics/${hero.typeId}`}
                className={cn(
                  "grid gap-0.5 rounded-lg border px-4 py-2.5 shadow-sm backdrop-blur-md transition-colors",
                  light || !media
                    ? "border-white/70 bg-white/75 hover:bg-white/90"
                    : "border-white/10 bg-white/10 hover:bg-white/20"
                )}
              >
                <span className={cn("text-[11px] font-medium", light || !media ? "text-muted-foreground" : "text-white/70")}>
                  {hero.name}
                </span>
                <span className="text-2xl font-semibold tabular-nums">{hero.value}</span>
              </Link>
            )}
            <div className="scrollbar-none flex max-w-full overflow-x-auto rounded-lg border bg-card/85 p-1 shadow-xs backdrop-blur-md">
              {RANGES.map((r) => (
                <Link
                  key={r}
                  href={`${pathname}?range=${r}`}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-semibold text-foreground transition-all",
                    data.range === r ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {RANGE_LABELS[r]}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      {data.keyCharts.filter((c) => c.series.points.length >= 2).length > 0 && (
        <section className="grid gap-3">
          <h2 className="text-lg font-semibold">Key trends</h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {data.keyCharts
              .filter((c) => c.series.points.length >= 2)
              .map((chart) => (
                <Card key={chart.typeId} className="interactive-card py-4">
                  <CardHeader className="px-4 pb-0">
                    <CardTitle className="flex items-center justify-between text-sm">
                      <Link href={`/metrics/${chart.typeId}?range=${data.range}`} className="hover:underline">
                        {chart.name}
                      </Link>
                      <span className="text-xs font-normal text-muted-foreground">{chart.series.caption}</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-2 pb-0">
                    <MetricChart series={chart.series} unit={chart.unit} markers={data.markers} height={200} />
                  </CardContent>
                </Card>
              ))}
          </div>
        </section>
      )}

      <section className="grid gap-3">
        <div>
          <h2 className="text-lg font-semibold">All {def.title.toLowerCase()} measurements</h2>
          <p className="text-sm text-muted-foreground">
            Every confirmed value in this system — nothing hidden.
          </p>
        </div>
        <Card className="py-1">
          <CardContent className="divide-y px-0">
            {data.metrics.map((row) => (
              <Link
                key={row.typeId}
                href={`/metrics/${row.typeId}?range=${data.range}`}
                className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-muted/40"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{row.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {new Date(row.latestDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    {" · "}
                    {row.pointCount.toLocaleString("en-IN")} value{row.pointCount === 1 ? "" : "s"}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <Sparkline values={row.spark} />
                  {interpBadge(row.interpretation)}
                  <span className="text-sm font-semibold tabular-nums">
                    {row.latestValue != null ? row.latestValue.toLocaleString("en-IN") : row.latestText}
                    {row.unit && <span className="ml-1 text-xs font-normal text-muted-foreground">{row.unit}</span>}
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </section>

      {(data.reports.length > 0 || data.genetics.length > 0) && (
        <section className="grid gap-3 lg:grid-cols-2">
          {data.reports.length > 0 && (
            <Card className="py-4">
              <CardHeader className="px-4 pb-0">
                <CardTitle className="flex items-center gap-1.5 text-sm">
                  <ClipboardList className="size-4 text-primary" /> Related reports
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 px-4">
                {data.reports.map((r) => (
                  <Link
                    key={r.id}
                    href={`/documents/${r.documentId}/review`}
                    className="rounded-md border p-2.5 transition-colors hover:bg-muted/40"
                  >
                    <p className="flex items-center justify-between text-sm font-medium">
                      {r.specialty ?? r.reportType}
                      {r.followUpRecommended && (
                        <span className="inline-flex items-center gap-1 text-xs text-destructive">
                          <AlertTriangle className="size-3.5" /> follow-up
                        </span>
                      )}
                    </p>
                    {r.reportDate && (
                      <p className="text-xs text-muted-foreground">
                        {new Date(r.reportDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      </p>
                    )}
                    {r.summary && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{r.summary}</p>}
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
          {data.genetics.length > 0 && (
            <Card className="py-4">
              <CardHeader className="px-4 pb-0">
                <CardTitle className="flex items-center gap-1.5 text-sm">
                  <Dna className="size-4 text-primary" /> Genetic context
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 px-4">
                {data.genetics.map((g) => (
                  <Link key={g.id} href="/genetics" className="rounded-md border p-2.5 transition-colors hover:bg-muted/40">
                    <p className="flex items-center justify-between gap-2 text-sm font-medium">
                      <span className="truncate">{g.conditionName}</span>
                      <Badge
                        className={cn(
                          g.riskLevel === "high"
                            ? "bg-destructive/10 text-destructive"
                            : "bg-[var(--warning)]/20 text-[color-mix(in_oklch,var(--warning),black_45%)]"
                        )}
                        variant="secondary"
                      >
                        {g.riskLevel}
                      </Badge>
                    </p>
                    {g.summary && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{g.summary}</p>}
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npm run lint && npx vitest run`
In preview:
- `/dashboard/cardiovascular?range=1y` — video header, hero value, key charts with band for HRV, uncapped metric list with sparklines.
- `/dashboard/blood` — gradient header (no media), all ~28 hematology+coagulation metrics listed.
- `/dashboard/metabolic` — genetic context card shows matching assessments; related reports show gastro discharge.
- `/dashboard/nope` — 404.
Expected: all verified; count metric list length against `psql` category counts.

- [ ] **Step 6: Commit**

```bash
git add src/lib/health/system.ts src/components/health/sparkline.tsx "src/app/(app)/dashboard/[system]/"
git commit -m "feat: add body-system drill-down pages with media headers"
```

---

### Task 8: Overview loader + slim `/dashboard` launcher

**Files:**
- Create: `src/lib/health/overview.ts`
- Create: `src/app/(app)/dashboard/overview-view.tsx`
- Modify: `src/app/(app)/dashboard/page.tsx` (replace entirely)
- Delete (deferred to Task 10): `src/app/(app)/dashboard/dashboard-view.tsx`

**Interfaces:**
- Consumes: Tasks 1–3 (`getMetricIndex`, `attentionState`, `SYSTEMS`, `metricBelongsTo`, `getMarkers`), Task 7 (`Sparkline` optional).
- Produces:
  - `type OverviewData = { profileName: string; attention: Array<MetricIndexRow>; historicalCount: number; systems: Array<{ id: string; title: string; eyebrow: string; media?: SystemMedia; tone: "danger" | "success" | "neutral"; memberCount: number; hero: { name: string; value: string } | null }>; measurementCount: number; careAreas: Array<{ key: string; label: string; count: number; followUpCount: number; latestDate: string | null }>; recentMarkers: Marker[] }`
  - `getOverviewData(profileId: string): Promise<OverviewData>`

- [ ] **Step 1: Implement `src/lib/health/overview.ts`**

```ts
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getMarkers, type Marker } from "./markers";
import { getMetricIndex, type MetricIndexRow } from "./metric";
import { attentionState } from "./series";
import { metricBelongsTo, SYSTEMS, type SystemMedia } from "./systems";

export type OverviewSystemCard = {
  id: string;
  title: string;
  eyebrow: string;
  media?: SystemMedia;
  tone: "danger" | "success" | "neutral";
  memberCount: number;
  hero: { name: string; value: string } | null;
};

export type OverviewCareArea = {
  key: string;
  label: string;
  count: number;
  followUpCount: number;
  latestDate: string | null;
};

export type OverviewData = {
  attention: MetricIndexRow[];
  historicalCount: number;
  systems: OverviewSystemCard[];
  measurementCount: number;
  careAreas: OverviewCareArea[];
  recentMarkers: Marker[];
};

function titleize(input: string) {
  return input
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

export async function getOverviewData(profileId: string): Promise<OverviewData> {
  const index = await getMetricIndex(profileId);

  const attention: MetricIndexRow[] = [];
  let historicalCount = 0;
  for (const row of index) {
    const state = attentionState({
      interpretation: row.interpretation,
      observedAt: new Date(row.latestDate),
    });
    if (state === "attention") attention.push(row);
    else if (state === "historical") historicalCount += 1;
  }
  attention.sort((a, b) => {
    const aCrit = a.interpretation === "critical" ? 0 : 1;
    const bCrit = b.interpretation === "critical" ? 0 : 1;
    if (aCrit !== bCrit) return aCrit - bCrit;
    return b.latestDate.localeCompare(a.latestDate);
  });

  const systems: OverviewSystemCard[] = [];
  for (const def of SYSTEMS) {
    const members = index.filter((row) =>
      metricBelongsTo(def, { category: row.category, name: row.name })
    );
    if (members.length === 0) continue;
    const byName = new Map(members.map((m) => [m.name, m]));
    const heroRow =
      def.heroMetrics.map((n) => byName.get(n)).find((r) => r && r.latestValue != null) ??
      members.find((m) => m.latestValue != null) ??
      null;
    const anyAttention = members.some(
      (m) =>
        attentionState({ interpretation: m.interpretation, observedAt: new Date(m.latestDate) }) ===
        "attention"
    );
    systems.push({
      id: def.id,
      title: def.title,
      eyebrow: def.eyebrow,
      media: def.media,
      tone: anyAttention ? "danger" : heroRow ? "success" : "neutral",
      memberCount: members.length,
      hero: heroRow
        ? {
            name: heroRow.name,
            value: `${heroRow.latestValue!.toLocaleString("en-IN")}${heroRow.unit ? ` ${heroRow.unit}` : ""}`,
          }
        : null,
    });
  }

  const reports = await db.query.clinicalReports.findMany({
    where: eq(schema.clinicalReports.profileId, profileId),
    orderBy: [desc(schema.clinicalReports.createdAt)],
    limit: 50,
  });
  const careMap = new Map<string, OverviewCareArea>();
  for (const report of reports) {
    const key = (report.specialty ?? report.reportType ?? "other").toLowerCase();
    const date = report.reportDate
      ? new Date(report.reportDate).toISOString()
      : report.createdAt.toISOString();
    const existing = careMap.get(key);
    if (!existing) {
      careMap.set(key, {
        key,
        label: report.specialty ? titleize(report.specialty) : titleize(report.reportType),
        count: 1,
        followUpCount: report.followUpRecommended ? 1 : 0,
        latestDate: date,
      });
    } else {
      existing.count += 1;
      if (report.followUpRecommended) existing.followUpCount += 1;
      if (!existing.latestDate || date > existing.latestDate) existing.latestDate = date;
    }
  }

  const markers = await getMarkers(profileId, null);

  return {
    attention: attention.slice(0, 8),
    historicalCount,
    systems,
    measurementCount: index.length,
    careAreas: [...careMap.values()].sort((a, b) =>
      (b.latestDate ?? "").localeCompare(a.latestDate ?? "")
    ),
    recentMarkers: markers.slice(-8).reverse(),
  };
}
```

- [ ] **Step 2: Implement `src/app/(app)/dashboard/overview-view.tsx`**

```tsx
"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ChevronRight,
  ClipboardList,
  Pill,
  Ruler,
  Stethoscope,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/mascot";
import type { OverviewData } from "@/lib/health/overview";
import { cn } from "@/lib/utils";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function toneBadge(tone: "danger" | "success" | "neutral") {
  if (tone === "danger") return <span className="rounded-full bg-red-500 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm">Review</span>;
  if (tone === "success") return <span className="rounded-full bg-emerald-400 px-2.5 py-1 text-[11px] font-semibold text-emerald-950 shadow-sm">Tracked</span>;
  return <span className="rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-foreground shadow-sm">Building</span>;
}

export function OverviewView({ profileName, data }: { profileName: string; data: OverviewData }) {
  const empty = data.systems.length === 0 && data.attention.length === 0;

  return (
    <div className="grid gap-5">
      <div>
        <Badge className="mb-2 bg-accent text-accent-foreground" variant="secondary">
          Dashboard
        </Badge>
        <h1 className="text-3xl font-semibold">Health overview</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {profileName} · {data.measurementCount.toLocaleString("en-IN")} tracked measurements
        </p>
      </div>

      {empty ? (
        <Card>
          <CardContent>
            <EmptyState
              mood="thinking"
              title="No confirmed values yet"
              description="Upload and confirm a report and Hearth will build this overview from what is actually present."
            />
          </CardContent>
        </Card>
      ) : (
        <>
          {data.attention.length > 0 && (
            <section className="grid gap-3">
              <div>
                <h2 className="text-lg font-semibold">Needs attention</h2>
                <p className="text-sm text-muted-foreground">
                  Recent confirmed values outside their reference range.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {data.attention.map((row) => (
                  <Link key={row.typeId} href={`/metrics/${row.typeId}`}>
                    <Card
                      className={cn(
                        "interactive-card h-full py-3",
                        row.interpretation === "critical"
                          ? "border-destructive/50 bg-destructive/8"
                          : "border-destructive/25 bg-destructive/4"
                      )}
                    >
                      <CardContent className="px-4">
                        <p className="flex items-center gap-1.5 text-xs font-medium text-destructive">
                          <AlertTriangle className="size-3.5" /> {row.interpretation}
                        </p>
                        <p className="mt-1 truncate text-sm font-semibold">{row.name}</p>
                        <p className="text-xl font-semibold tabular-nums">
                          {row.latestValue?.toLocaleString("en-IN")}
                          {row.unit && (
                            <span className="ml-1 text-xs font-normal text-muted-foreground">{row.unit}</span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">{fmtDate(row.latestDate)}</p>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
              {data.historicalCount > 0 && (
                <p className="text-xs text-muted-foreground">
                  {data.historicalCount} older abnormal value{data.historicalCount === 1 ? "" : "s"} not shown —
                  they appear on their measurement pages.
                </p>
              )}
            </section>
          )}

          <section className="grid gap-3">
            <div>
              <h2 className="text-lg font-semibold">Body systems</h2>
              <p className="text-sm text-muted-foreground">Open a system to see every related measurement.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.systems.map((system) => (
                <Link key={system.id} href={`/dashboard/${system.id}`} className="group">
                  <Card className="interactive-card h-full overflow-hidden py-0">
                    <div
                      className={cn(
                        "relative h-40 overflow-hidden",
                        system.media
                          ? system.media.tone === "dark"
                            ? "bg-slate-950"
                            : "bg-slate-100"
                          : "bg-[linear-gradient(135deg,oklch(0.96_0.025_226),oklch(0.99_0.018_185))] dark:bg-[linear-gradient(135deg,oklch(0.24_0.045_240),oklch(0.18_0.038_252))]"
                      )}
                    >
                      {system.media?.video ? (
                        <video
                          aria-hidden="true"
                          autoPlay
                          loop
                          muted
                          playsInline
                          poster={system.media.image}
                          className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:hidden"
                          style={{ objectPosition: system.media.position }}
                        >
                          <source src={system.media.video} type="video/mp4" />
                        </video>
                      ) : system.media ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={system.media.image}
                          alt=""
                          aria-hidden="true"
                          className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-105"
                          style={{ objectPosition: system.media.position }}
                        />
                      ) : null}
                      {system.media?.video && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={system.media.image}
                          alt=""
                          aria-hidden="true"
                          className="absolute inset-0 hidden size-full object-cover motion-reduce:block"
                          style={{ objectPosition: system.media.position }}
                        />
                      )}
                      <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(2,6,23,.55),rgba(2,6,23,.05)_60%)]" />
                      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3 text-white">
                        <div className="min-w-0">
                          <p className="text-[11px] font-medium uppercase tracking-wide text-white/70">
                            {system.eyebrow}
                          </p>
                          <p className="truncate text-base font-semibold">{system.title}</p>
                        </div>
                        {toneBadge(system.tone)}
                      </div>
                    </div>
                    <CardContent className="flex items-center justify-between px-4 py-3">
                      <span className="min-w-0 text-sm text-muted-foreground">
                        {system.hero ? (
                          <>
                            <span className="block text-xs">{system.hero.name}</span>
                            <span className="block truncate text-base font-semibold tabular-nums text-foreground">
                              {system.hero.value}
                            </span>
                          </>
                        ) : (
                          "Reports only"
                        )}
                      </span>
                      <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                        {system.memberCount} metric{system.memberCount === 1 ? "" : "s"}
                        <ChevronRight className="size-4" />
                      </span>
                    </CardContent>
                  </Card>
                </Link>
              ))}

              <Link href="/metrics" className="group">
                <Card className="interactive-card grid h-full place-items-center border-dashed py-8">
                  <CardContent className="grid place-items-center gap-2 text-center">
                    <span className="grid size-12 place-items-center rounded-full border bg-muted/40">
                      <Ruler className="size-5 text-primary" />
                    </span>
                    <p className="text-sm font-semibold">All measurements</p>
                    <p className="text-xs text-muted-foreground">
                      Browse and search all {data.measurementCount.toLocaleString("en-IN")} tracked values
                    </p>
                  </CardContent>
                </Card>
              </Link>
            </div>
          </section>

          {data.careAreas.length > 0 && (
            <section className="grid gap-3">
              <h2 className="text-lg font-semibold">Care reports</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {data.careAreas.map((area) => (
                  <Link key={area.key} href="/documents">
                    <Card className="interactive-card h-full py-3">
                      <CardContent className="px-4">
                        <p className="flex items-center gap-1.5 text-sm font-semibold">
                          <ClipboardList className="size-4 text-primary" /> {area.label}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {area.count} report{area.count === 1 ? "" : "s"}
                          {area.latestDate ? ` · latest ${fmtDate(area.latestDate)}` : ""}
                        </p>
                        {area.followUpCount > 0 && (
                          <p className="mt-1 flex items-center gap-1 text-xs font-medium text-destructive">
                            <AlertTriangle className="size-3.5" /> {area.followUpCount} follow-up flagged
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {data.recentMarkers.length > 0 && (
            <section className="grid gap-3">
              <h2 className="text-lg font-semibold">Recent events</h2>
              <Card className="py-2">
                <CardContent className="grid gap-1.5 px-4 py-2">
                  {data.recentMarkers.map((m, i) => (
                    <div key={`${m.date}-${i}`} className="flex items-center gap-2 text-sm">
                      {m.kind === "prescription" || m.kind === "medication" ? (
                        <Pill className="size-4 text-muted-foreground" />
                      ) : (
                        <Stethoscope className="size-4 text-muted-foreground" />
                      )}
                      <span className="tabular-nums text-muted-foreground">{fmtDate(m.date)}</span>
                      {m.label}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </section>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Replace `src/app/(app)/dashboard/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getActiveProfile } from "@/lib/active-profile";
import { getOverviewData } from "@/lib/health/overview";
import { OverviewView } from "./overview-view";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { profile } = await getActiveProfile(session.user.id);
  if (!profile) redirect("/profiles");

  const data = await getOverviewData(profile.id);
  return <OverviewView profileName={profile.displayName} data={data} />;
}
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run lint && npx vitest run`
In preview:
- `/dashboard` — attention strip shows recent abnormals (ALT, CRP, LDL…) but NOT the 2018 Clotting Time (it counts toward the "older abnormal values" note); system gallery cards play videos and link to system pages; "All measurements" card links to `/metrics`; care reports and recent events render.
- Switch to Nandita's profile — Pip empty state, no errors.
- Mobile viewport (375px) — gallery stacks, no horizontal scroll.
Expected: verified with screenshots.

- [ ] **Step 5: Commit**

```bash
git add src/lib/health/overview.ts "src/app/(app)/dashboard/page.tsx" "src/app/(app)/dashboard/overview-view.tsx"
git commit -m "feat: slim dashboard into cinematic drill-down launcher"
```

---

### Task 9: ⌘K metric search

**Files:**
- Create: `src/components/shell/command-menu.tsx`
- Modify: `src/app/(app)/layout.tsx` (mount the menu; read the file first — it already resolves session/profile for the shell)

**Interfaces:**
- Consumes: `getMetricIndex` (Task 3), `SYSTEMS` (Task 2).
- Produces: `<CommandMenu items />` where `items: Array<{ label: string; hint: string; href: string }>`.

- [ ] **Step 1: Implement `src/components/shell/command-menu.tsx`**

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type CommandItem = { label: string; hint: string; href: string };

const MAX_RESULTS = 12;

export function CommandMenu({ items }: { items: CommandItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
        setQuery("");
        setActive(0);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, MAX_RESULTS);
    return items
      .filter((i) => i.label.toLowerCase().includes(q) || i.hint.toLowerCase().includes(q))
      .slice(0, MAX_RESULTS);
  }, [items, query]);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="top-24 translate-y-0 p-0 sm:max-w-lg">
        <DialogHeader className="sr-only">
          <DialogTitle>Search measurements</DialogTitle>
        </DialogHeader>
        <div className="relative border-b">
          <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            className="h-12 rounded-none border-0 pl-11 shadow-none focus-visible:ring-0"
            placeholder="Jump to a measurement or system…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter" && results[active]) {
                e.preventDefault();
                go(results[active].href);
              }
            }}
          />
        </div>
        <ul className="max-h-80 overflow-y-auto p-1.5">
          {results.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">No matches</li>
          )}
          {results.map((item, i) => (
            <li key={item.href}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => go(item.href)}
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm",
                  i === active ? "bg-primary/10 text-foreground" : "text-muted-foreground"
                )}
              >
                <span className="truncate font-medium">{item.label}</span>
                <span className="shrink-0 text-xs">{item.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Mount in `src/app/(app)/layout.tsx`**

Read the file first. It is a server layout that already resolves the session and active profile for the shell. Add, alongside its existing data loading (only when a profile exists):

```tsx
import { CommandMenu, type CommandItem } from "@/components/shell/command-menu";
import { getMetricIndex } from "@/lib/health/metric";
import { SYSTEMS } from "@/lib/health/systems";
```

```tsx
const index = profile ? await getMetricIndex(profile.id) : [];
const commandItems: CommandItem[] = [
  ...SYSTEMS.map((s) => ({ label: s.title, hint: "System", href: `/dashboard/${s.id}` })),
  ...index.map((m) => ({ label: m.name, hint: m.categoryLabel, href: `/metrics/${m.typeId}` })),
];
```

Render `<CommandMenu items={commandItems} />` inside the layout's returned tree (next to the nav). If the layout does not resolve a profile, resolve it exactly like `src/app/(app)/dashboard/page.tsx:14-17` does — but without redirecting (layouts must render children for `/profiles` too; pass an empty items array when no profile).

- [ ] **Step 3: Verify**

In preview: press ⌘K → dialog opens; type "hba" → HbA1c appears; Enter navigates to its metric page; type "heart" → Heart & circulation system appears. Esc closes.
Run: `npx tsc --noEmit && npm run lint`
Expected: works, no hydration warnings in console.

- [ ] **Step 4: Commit**

```bash
git add src/components/shell/command-menu.tsx "src/app/(app)/layout.tsx"
git commit -m "feat: add command-K search across measurements and systems"
```

---

### Task 10: Cleanup, full verification, polish

**Files:**
- Delete: `src/app/(app)/dashboard/dashboard-view.tsx`
- Delete: `src/lib/dashboard.ts`
- Delete: `src/app/api/dashboard/metabolic-liver/route.ts`

**Interfaces:** none — removal + verification only.

- [ ] **Step 1: Confirm nothing still imports the dead modules**

Run:

```bash
grep -rn "lib/dashboard\|dashboard-view\|metabolic-liver" src --include="*.ts" --include="*.tsx"
```

Expected: no hits outside the three files being deleted. (`src/app/api/dashboard/metabolic-liver/route.ts` was the only external consumer of `getMetabolicLiverData`; it is being deleted with it.)

- [ ] **Step 2: Delete dead code**

```bash
git rm "src/app/(app)/dashboard/dashboard-view.tsx" src/lib/dashboard.ts src/app/api/dashboard/metabolic-liver/route.ts
```

- [ ] **Step 3: Full check**

Run: `npx tsc --noEmit && npm run lint && npx vitest run && npm run build`
Expected: all green.

- [ ] **Step 4: End-to-end walkthrough in preview (spec's manual checklist)**

1. `/dashboard` → click cardiovascular card → `/dashboard/cardiovascular` → click HRV chart title → `/metrics/<id>?range=all` shows "Monthly averages from 7,989 readings" band chart.
2. `/dashboard` attention strip → CRP card → metric page shows sparse dots, critical badge, and June 2026 discharge marker on the chart.
3. `/labs` → redirects to `/metrics`; search "vitamin" filters instantly.
4. ⌘K → "ldl" → Enter → LDL metric page.
5. Mobile viewport (375px): overview, system page, metric page — no horizontal scroll, charts legible.
6. Dark mode (`preview_resize` colorScheme dark): media overlays and glass cards stay readable.
7. Switch to Nandita → overview shows Pip empty state.

Expected: every step verified; screenshot the overview, one system page, one metric page.

- [ ] **Step 5: Update project docs**

If `CLAUDE.md`/`AGENTS.md` reference the Labs page or old dashboard, update those references to `/metrics` and the drill-down structure. (Check: `grep -rn "labs\|dashboard" CLAUDE.md AGENTS.md README.md 2>/dev/null` — update only real references, skip if none.)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove superseded dashboard and labs code after drill-down migration"
```
