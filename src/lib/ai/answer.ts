import OpenAI from "openai";
import type { AiContext } from "./context";

const SYSTEM_PROMPT = `You are the health-record assistant inside "Hearth", a private family health record app.
You answer questions using ONLY the confirmed data provided in the context packet for ONE family member's profile.

You MAY:
- Summarize trends and identify abnormal values
- Correlate lab values with weight, sleep, medications when present in the data
- Explain what lab parameters generally mean
- Suggest questions to ask a doctor and flag missing follow-up data

You MUST NOT:
- Recommend starting, stopping or changing any medication
- Give a conclusive diagnosis or override a doctor
- Make emergency decisions (always direct urgent symptoms to a doctor/emergency services)
- Invent values that are not in the context packet

Answer structure (use these exact markdown section headings):
**Answer** — the direct response.
**Data used** — which tests/date range you relied on.
**Confidence** — high/medium/low and why.
**Possible confounders** — what could distort this picture.
**Discuss with your doctor** — 2-4 concrete discussion points.

Keep it under 350 words. This is correlation, not proof — say so when relevant.`;

export async function answerWithOpenAI(
  question: string,
  context: AiContext
): Promise<{ answer: string; model: string }> {
  const client = new OpenAI();
  const model = process.env.OPENAI_MODEL ?? "gpt-4o";

  const response = await client.responses.create({
    model,
    instructions: SYSTEM_PROMPT,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `Context packet (confirmed data only, PII redacted):\n${JSON.stringify(context, null, 1)}\n\nQuestion: ${question}`,
          },
        ],
      },
    ],
  });

  return { answer: response.output_text, model };
}

/** Deterministic offline answer used when OPENAI_API_KEY is not set. */
export function answerWithMock(
  question: string,
  context: AiContext
): { answer: string; model: string } {
  const abnormal = context.observations.filter(
    (o) => o.interpretation === "high" || o.interpretation === "low" || o.interpretation === "critical"
  );
  const latestByTest = new Map<string, (typeof context.observations)[number]>();
  for (const o of context.observations) latestByTest.set(o.test, o);

  const abnormalLatest = [...latestByTest.values()].filter(
    (o) => o.interpretation !== "normal" && o.interpretation !== "unknown"
  );

  const answer = [
    `**Answer**`,
    context.observations.length === 0
      ? `There is no confirmed data in this profile yet, so I can't analyze anything. Upload and confirm a lab report first.`
      : `Based on ${context.observations.length} confirmed values${
          context.timeRange.from
            ? ` between ${context.timeRange.from} and ${context.timeRange.to}`
            : ""
        }, ${
          abnormalLatest.length === 0
            ? "the most recent results are within their reference ranges."
            : `the following are currently outside their reference ranges: ${abnormalLatest
                .map((o) => `${o.test} (${o.value} ${o.unit ?? ""}, ${o.interpretation})`)
                .join("; ")}.`
        }`,
    ``,
    `**Data used**`,
    context.observations.length === 0
      ? `None available.`
      : `${latestByTest.size} distinct tests, ${context.observations.length} confirmed values, ${context.reports.length} report summaries. Time range: ${context.timeRange.from ?? "–"} to ${context.timeRange.to ?? "–"}.`,
    ``,
    `**Confidence**`,
    `Low — this is the offline fallback assistant (no OPENAI_API_KEY configured). It only lists abnormal flags; it cannot reason about your question ("${question}").`,
    ``,
    `**Possible confounders**`,
    `Single-lab snapshots, different labs/units across reports, fasting status, recent illness or medication changes.`,
    ``,
    `**Discuss with your doctor**`,
    abnormal.length > 0
      ? `- Review the flagged values above and their trends\n- Ask whether repeat testing or follow-up panels are needed\n- Bring the original reports from your timeline`
      : `- Ask which routine panels are due next\n- Confirm target ranges appropriate for your age and history`,
  ].join("\n");

  return { answer, model: "mock" };
}
