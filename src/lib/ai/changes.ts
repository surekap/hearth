/**
 * "What improved and what got worse?" needs a then-versus-now reading per
 * test, judged against the reference range — a value moving from 210 to 180
 * is an improvement if the range tops out at 200, and noise if it never left
 * it. This computes that table once so both the rules engine and the model
 * answer from the same arithmetic. Pure logic, no DB access.
 */

export type ChangeDirection = "improved" | "worsened" | "stable" | "unclear";

export type ObservationPoint = {
  test: string;
  date: string;
  value: number | string | null;
  unit: string | null;
  referenceLow: number | null;
  referenceHigh: number | null;
  interpretation: string;
};

export type TestChange = {
  test: string;
  unit: string | null;
  from: { date: string; value: number };
  to: { date: string; value: number };
  deltaPercent: number;
  referenceLow: number | null;
  referenceHigh: number | null;
  latestInterpretation: string;
  direction: ChangeDirection;
};

export type ChangeSummary = {
  windowMonths: number | null;
  since: string | null;
  changes: TestChange[];
  /** Tests with only one value in the window, so nothing to compare. */
  singleValueTests: string[];
};

const WINDOW =
  /\b(?:last|past|previous|recent)\s+(?:(\d+|one|two|three|six|twelve|a|an)\s+)?(month|year|week)s?\b/i;
const NUMBER_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  six: 6,
  twelve: 12,
};

/** "last 6 months" → 6, "past year" → 12, "last two weeks" → 1 (rounded up). */
export function parseWindowMonths(question: string): number | null {
  const match = WINDOW.exec(question);
  if (!match) return null;
  const count = match[1] ? (NUMBER_WORDS[match[1].toLowerCase()] ?? Number(match[1])) : 1;
  if (!Number.isFinite(count) || count <= 0) return null;
  const unit = match[2].toLowerCase();
  if (unit === "year") return count * 12;
  if (unit === "week") return Math.max(1, Math.ceil(count / 4));
  return count;
}

function monthsBefore(now: Date, months: number): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}

/** How far outside the reference range a value sits; 0 when inside or no range. */
function excursion(value: number, lo: number | null, hi: number | null): number {
  let out = 0;
  if (lo !== null && value < lo) out = lo - value;
  if (hi !== null && value > hi) out = value - hi;
  return out;
}

const STABLE_PERCENT = 5;

export function judgeDirection(
  from: number,
  to: number,
  lo: number | null,
  hi: number | null
): ChangeDirection {
  const pct = from === 0 ? (to === 0 ? 0 : 100) : Math.abs((to - from) / Math.abs(from)) * 100;
  if (pct < STABLE_PERCENT) return "stable";
  if (lo === null && hi === null) return "unclear";
  const before = excursion(from, lo, hi);
  const after = excursion(to, lo, hi);
  if (before === 0 && after === 0) return "stable";
  if (after < before) return "improved";
  if (after > before) return "worsened";
  return "stable";
}

/**
 * Splits one test's readings (ascending by date) into a baseline and the
 * readings inside the window. The baseline is the last reading before the
 * window opened — where things stood "then". Labs are often yearly, so a
 * six-month question may legitimately compare against last year's panel;
 * but a reading older than two years (or twice the window, if longer) says
 * nothing about the period asked about, and the earliest reading inside
 * the window is used instead.
 */
const MIN_BASELINE_REACH_MONTHS = 24;

export function selectWindow<T extends { date: string }>(
  series: T[],
  windowMonths: number | null,
  now: Date
): { baseline: T | null; inside: T[]; since: string | null } {
  if (windowMonths === null) {
    return { baseline: series[0] ?? null, inside: series.slice(1), since: null };
  }
  const since = monthsBefore(now, windowMonths);
  const staleBefore = monthsBefore(now, Math.max(windowMonths * 2, MIN_BASELINE_REACH_MONTHS));
  const before = series.filter((o) => o.date <= since && o.date >= staleBefore);
  const inside = series.filter((o) => o.date > since);
  if (before.length > 0) return { baseline: before[before.length - 1], inside, since };
  return { baseline: inside[0] ?? null, inside: inside.slice(1), since };
}

/**
 * Baseline is the last value at or before the window opened (what things
 * looked like "then"), falling back to the earliest value inside it. Current
 * is the latest value, which must fall inside the window to count as recent.
 */
export function summarizeChanges(
  observations: ObservationPoint[],
  options: { windowMonths: number | null; now?: Date }
): ChangeSummary {
  const now = options.now ?? new Date();
  const since = options.windowMonths === null ? null : monthsBefore(now, options.windowMonths);

  const byTest = new Map<string, ObservationPoint[]>();
  for (const o of observations) {
    if (typeof o.value !== "number") continue;
    const list = byTest.get(o.test) ?? [];
    list.push(o);
    byTest.set(o.test, list);
  }

  const changes: TestChange[] = [];
  const singleValueTests: string[] = [];
  for (const [test, all] of byTest) {
    const series = [...all].sort((a, b) => a.date.localeCompare(b.date));
    const latest = series[series.length - 1];
    if (since && latest.date < since) continue; // nothing recent for this test
    const { baseline } = selectWindow(series, options.windowMonths, now);
    // Several readings on one day (exercise stages, pre/post bronchodilator)
    // are one visit, not a before-and-after.
    if (!baseline || baseline === latest || baseline.date === latest.date) {
      singleValueTests.push(test);
      continue;
    }
    const from = baseline.value as number;
    const to = latest.value as number;
    const lo = latest.referenceLow ?? baseline.referenceLow;
    const hi = latest.referenceHigh ?? baseline.referenceHigh;
    changes.push({
      test,
      unit: latest.unit,
      from: { date: baseline.date, value: from },
      to: { date: latest.date, value: to },
      deltaPercent: from === 0 ? 0 : Math.round(((to - from) / Math.abs(from)) * 100),
      referenceLow: lo,
      referenceHigh: hi,
      latestInterpretation: latest.interpretation,
      direction: judgeDirection(from, to, lo, hi),
    });
  }

  const order: Record<ChangeDirection, number> = { worsened: 0, improved: 1, unclear: 2, stable: 3 };
  changes.sort(
    (a, b) =>
      order[a.direction] - order[b.direction] ||
      Math.abs(b.deltaPercent) - Math.abs(a.deltaPercent)
  );
  return { windowMonths: options.windowMonths, since, changes, singleValueTests };
}
