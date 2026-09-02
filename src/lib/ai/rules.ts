import type { AiContext } from "./context";
import { parseWindowMonths, selectWindow, summarizeChanges, type TestChange } from "./changes";
import { encodeBlocks, type AnswerBlock } from "./blocks";

/**
 * Rules engine: answers purely-numeric questions (trend, latest value,
 * abnormal list) straight from confirmed observations — no LLM call at all.
 * Returns null when the question needs actual reasoning.
 */

const TREND_WORDS = /\b(trend|trended|trending|chang(e|ed|ing)|over time|over the (last|past)|history|progress(ed|ion)?|evolv(e|ed)|since)\b/i;
const LATEST_WORDS = /\b(latest|last|current|most recent|now|today|right now)\b/i;
const CHANGE_WORDS =
  /\b(improv(e|ed|ing|ement)|better|wors(e|ened|ening)|declin(e|ed|ing)|deteriorat(e|ed|ing)|chang(e|es|ed|ing)|moved|different|progress)\b/i;
/** Words that make a question about the whole record rather than one test. */
const BREADTH_WORDS =
  /\b(health|labs?|lab results?|results|values|numbers|bloodwork|blood work|panels?|everything|overall|in general|generally|all)\b/i;
const ABNORMAL_WORDS = /\b(abnormal|out of range|flagged|out of whack|elevated|too (high|low)|concerning|red flags?)\b/i;

function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function fmt(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

type Obs = AiContext["observations"][number];

function sections(parts: {
  answer: string;
  dataUsed: string;
  confounders?: string;
  doctorPoints: string[];
  blocks?: AnswerBlock[];
}) {
  return encodeBlocks([
    `**Answer**`,
    parts.answer,
    ``,
    `**Data used**`,
    parts.dataUsed,
    ``,
    `**Confidence**`,
    `High — this was computed directly from your confirmed values (no AI model involved).`,
    ``,
    `**Possible confounders**`,
    parts.confounders ??
      `Different labs and units across reports, fasting status, and timing of samples can shift individual values.`,
    ``,
    `**Discuss with your doctor**`,
    ...parts.doctorPoints.map((p) => `- ${p}`),
  ].join("\n"), parts.blocks ?? []);
}

export function tryRuleAnswer(
  question: string,
  context: AiContext
): { answer: string; model: string } | null {
  const q = ` ${normalize(question)} `;
  const observations = context.observations.filter((o) => typeof o.value === "number");
  if (observations.length === 0) return null;

  // Which tests does the question mention?
  const byTest = new Map<string, Obs[]>();
  for (const o of observations) {
    const list = byTest.get(o.test) ?? [];
    list.push(o);
    byTest.set(o.test, list);
  }
  const mentioned = [...byTest.keys()].filter((t) =>
    q.includes(` ${normalize(t)} `)
  );

  // "What's abnormal?" — no specific test needed
  if (ABNORMAL_WORDS.test(question) && mentioned.length === 0) {
    const latestByTest = new Map<string, Obs>();
    for (const o of observations) latestByTest.set(o.test, o);
    const abnormal = [...latestByTest.values()].filter(
      (o) => o.interpretation === "high" || o.interpretation === "low" || o.interpretation === "critical"
    );
    const answer =
      abnormal.length === 0
        ? `Good news: the most recent value of every tracked test is inside its reference range. Keep doing what you're doing — and keep the routine panels coming so we can see it stays that way.`
        : `${abnormal.length} value${abnormal.length === 1 ? " is" : "s are"} currently outside range, and I want you to take ${abnormal.length === 1 ? "it" : "them"} seriously: ${abnormal
            .map(
              (o) =>
                `${o.test} at ${fmt(o.value as number)} ${o.unit ?? ""} (${o.interpretation}, ref ${o.referenceLow ?? "–"}–${o.referenceHigh ?? "–"}, ${fmtDate(o.date)})`
            )
            .join("; ")}.`;
    return {
      answer: sections({
        answer,
        dataUsed: `Most recent confirmed value of each of ${latestByTest.size} tests (${context.timeRange.from} → ${context.timeRange.to}).`,
        doctorPoints:
          abnormal.length === 0
            ? ["Ask which routine panels are due next", "Confirm target ranges for your age and history"]
            : [
                `Review the flagged values: ${abnormal.map((o) => o.test).join(", ")}`,
                "Ask whether repeat testing or follow-up panels are warranted",
                "Bring the original reports from your timeline",
              ],
      }),
      model: "rules-engine",
    };
  }

  // "What improved / got worse over the last 6 months?" — a then-vs-now table.
  // A test named in passing ("the weight has come down, but how are the
  // labs?") must not narrow a whole-record question down to that one test.
  if (CHANGE_WORDS.test(question) && (mentioned.length === 0 || BREADTH_WORDS.test(question))) {
    return changeAnswer(question, context);
  }

  if (mentioned.length !== 1) return null; // ambiguous or none → let the LLM reason
  const test = mentioned[0];
  const history = windowed(byTest.get(test)!, parseWindowMonths(question)); // ascending by date

  // Trend question for one test
  if (TREND_WORDS.test(question)) {
    if (history.length < 2) {
      return {
        answer: sections({
          answer: `I only have one confirmed ${test} value on file (${fmt(history[0].value as number)} ${history[0].unit ?? ""} on ${fmtDate(history[0].date)}), so there's no trend to read yet. Get a repeat test — one point is a data point, two is the beginning of a story.`,
          dataUsed: `1 confirmed ${test} value.`,
          doctorPoints: [`Ask when ${test} should be re-tested to establish a trend`],
        }),
        model: "rules-engine",
      };
    }
    const first = history[0];
    const last = history[history.length - 1];
    const delta = (last.value as number) - (first.value as number);
    const pct = first.value ? Math.round((delta / Math.abs(first.value as number)) * 100) : 0;
    const dir = delta > 0 ? "risen" : delta < 0 ? "fallen" : "held steady";
    const lastAbnormal =
      last.interpretation === "high" || last.interpretation === "low" || last.interpretation === "critical";
    const risingIntoAbnormal = lastAbnormal && Math.abs(pct) >= 5;

    const values = `${fmt(first.value as number)} ${first.unit ?? ""} (${fmtDate(first.date)}) → ${fmt(last.value as number)} ${last.unit ?? ""} (${fmtDate(last.date)})`;
    const chart: AnswerBlock = {
      type: "series-chart",
      test,
      unit: last.unit,
      referenceLow: last.referenceLow,
      referenceHigh: last.referenceHigh,
      points: history.map((o) => ({
        date: o.date,
        value: o.value as number,
        interpretation: o.interpretation,
      })),
    };

    const verdict = risingIntoAbnormal
      ? `That trajectory needs your attention — the latest value is ${last.interpretation} and moving the wrong way. Don't let this drift another six months without a plan.`
      : lastAbnormal
        ? `The latest value is still ${last.interpretation}; the trend matters less than getting it back in range.`
        : delta === 0
          ? `Stable and in range — exactly what we want to see.`
          : `The latest value is within range. ${dir === "fallen" ? "Nice work — keep it up." : "Worth keeping an eye on, but nothing alarming."}`;

    return {
      answer: sections({
        answer: `${test} has ${dir} ${pct !== 0 ? `${Math.abs(pct)}% ` : ""}across ${history.length} measurements: ${values}. ${verdict}`,
        dataUsed: `${history.length} confirmed ${test} values from ${fmtDate(first.date)} to ${fmtDate(last.date)}.`,
        blocks: [chart],
        doctorPoints: risingIntoAbnormal
          ? [
              `Show your doctor the ${test} series above and ask what's driving it`,
              `Ask what target and re-test interval to aim for`,
              `Ask whether related panels should be checked alongside it`,
            ]
          : [`Ask how often ${test} should be monitored given this trend`],
      }),
      model: "rules-engine",
    };
  }

  // Latest-value question for one test
  if (LATEST_WORDS.test(question) || /\bwhat('| i)?s my\b/i.test(question)) {
    const last = history[history.length - 1];
    const flagged =
      last.interpretation === "high" || last.interpretation === "low" || last.interpretation === "critical";
    return {
      answer: sections({
        answer: `Your most recent ${test} is ${fmt(last.value as number)} ${last.unit ?? ""} (${fmtDate(last.date)}), reference ${last.referenceLow ?? "–"}–${last.referenceHigh ?? "–"}. ${
          flagged
            ? `That is ${last.interpretation}, and it deserves follow-up rather than a shrug.`
            : `That's within range — good.`
        }`,
        dataUsed: `Most recent of ${history.length} confirmed ${test} value${history.length === 1 ? "" : "s"}.`,
        doctorPoints: flagged
          ? [`Ask what a ${last.interpretation} ${test} means alongside your other results`, `Ask when to re-test`]
          : [`Ask when ${test} is next due`],
      }),
      model: "rules-engine",
    };
  }

  return null;
}

/**
 * A "last 6 months" trend runs from the last reading before the window to the
 * latest, so the baseline is where things stood when the window opened rather
 * than a value from a decade ago.
 */
function windowed(history: Obs[], windowMonths: number | null): Obs[] {
  if (windowMonths === null) return history;
  const { baseline, inside } = selectWindow(history, windowMonths, new Date());
  if (inside.length === 0 && !baseline) return history;
  return baseline ? [baseline, ...inside] : inside;
}

function changeAnswer(question: string, context: AiContext): { answer: string; model: string } {
  const windowMonths = parseWindowMonths(question);
  const summary =
    windowMonths === null || windowMonths === context.changes.windowMonths
      ? context.changes
      : summarizeChanges(context.observations, { windowMonths });
  const windowLabel =
    summary.windowMonths === null
      ? "your full history"
      : summary.windowMonths === 1
        ? "the last month"
        : `the last ${summary.windowMonths} months`;

  const improved = summary.changes.filter((c) => c.direction === "improved");
  const worsened = summary.changes.filter((c) => c.direction === "worsened");
  const stable = summary.changes.filter((c) => c.direction === "stable");
  const unclear = summary.changes.filter((c) => c.direction === "unclear");

  if (summary.changes.length === 0) {
    const single = summary.singleValueTests.length;
    return {
      answer: sections({
        answer:
          single > 0
            ? `I can't compare anything over ${windowLabel}: ${single} test${single === 1 ? " has" : "s have"} only one value in that window, and a comparison needs two. Widen the window, or get repeat panels and we'll have a real before-and-after.`
            : `There are no confirmed values in ${windowLabel}, so there is nothing to compare yet.`,
        dataUsed: `Confirmed values from ${summary.since ?? context.timeRange.from ?? "–"} to ${context.timeRange.to ?? "–"}.`,
        doctorPoints: ["Ask which panels are worth repeating so trends can be read"],
      }),
      model: "rules-engine",
    };
  }

  const name = (c: TestChange) => c.test;
  const lines: string[] = [];
  if (worsened.length > 0) {
    lines.push(
      `Getting worse (${worsened.length}) — ${worsened.slice(0, 4).map(name).join(", ")}${worsened.length > 4 ? ` and ${worsened.length - 4} more` : ""}. These need a plan, not patience.`
    );
  }
  if (improved.length > 0) {
    lines.push(
      `Improved (${improved.length}) — ${improved.slice(0, 4).map(name).join(", ")}${improved.length > 4 ? ` and ${improved.length - 4} more` : ""}. Real progress; keep doing what you're doing.`
    );
  }
  if (worsened.length === 0 && improved.length === 0) {
    lines.unshift(`Over ${windowLabel} nothing has moved meaningfully in either direction.`);
  }
  lines.push(
    `${stable.length} steady${unclear.length > 0 ? `, ${unclear.length} moved without a reference range to judge by` : ""}${summary.singleValueTests.length > 0 ? `, ${summary.singleValueTests.length} with only one reading in the window` : ""}. Every test is in the comparison below.`
  );

  const table: AnswerBlock = {
    type: "change-table",
    windowLabel,
    since: summary.since,
    rows: summary.changes.map((c) => ({
      test: c.test,
      unit: c.unit,
      from: c.from,
      to: c.to,
      deltaPercent: c.deltaPercent,
      referenceLow: c.referenceLow,
      referenceHigh: c.referenceHigh,
      direction: c.direction,
    })),
    singleValueTests: summary.singleValueTests,
  };

  return {
    answer: sections({
      answer: lines.join("\n\n"),
      blocks: [table],
      dataUsed: `${summary.changes.length} tests with a before-and-after over ${windowLabel} (since ${summary.since ?? context.timeRange.from}); "before" is the last value at the start of the window, "after" is the latest value. Improved/worse is judged by distance from the reference range, and moves under 5% count as steady.`,
      doctorPoints:
        worsened.length > 0
          ? [
              `Show your doctor the worsening series: ${worsened.map((c) => c.test).join(", ")}`,
              "Ask what is driving them and what target to aim for",
              "Ask when to re-test",
            ]
          : ["Ask which panels are due next to keep the trend visible"],
    }),
    model: "rules-engine",
  };
}
