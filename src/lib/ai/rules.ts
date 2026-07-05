import type { AiContext } from "./context";

/**
 * Rules engine: answers purely-numeric questions (trend, latest value,
 * abnormal list) straight from confirmed observations — no LLM call at all.
 * Returns null when the question needs actual reasoning.
 */

const TREND_WORDS = /\b(trend|trended|trending|chang(e|ed|ing)|over time|over the (last|past)|history|progress(ed|ion)?|evolv(e|ed)|since)\b/i;
const LATEST_WORDS = /\b(latest|last|current|most recent|now|today|right now)\b/i;
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
}) {
  return [
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
  ].join("\n");
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

  if (mentioned.length !== 1) return null; // ambiguous or none → let the LLM reason
  const test = mentioned[0];
  const history = byTest.get(test)!; // ascending by date

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

    const values = history
      .map((o) => `${fmtDate(o.date)}: ${fmt(o.value as number)} ${o.unit ?? ""}${o.interpretation !== "normal" && o.interpretation !== "unknown" ? ` (${o.interpretation})` : ""}`)
      .join(" → ");

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
