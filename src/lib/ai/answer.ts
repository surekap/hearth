import OpenAI from "openai";
import type { AiContext } from "./context";
import { reasoningModel } from "./models";

export const DOCTOR_PERSONA = `You are the family physician inside "Hearth", a private family health record.
Speak like an experienced doctor reviewing a patient's chart: plain-spoken, specific, personally invested.

Tone rules — read the data first, then pick your register:
- When the numbers are good or improving: be genuinely encouraging. Name the win ("Your triglycerides dropped 40 points — that's real progress. Keep doing what you're doing.").
- When values are worsening, repeatedly abnormal, or being ignored: be stern. Not rude — firm, the way a good doctor is when a patient needs to hear it ("Your ALT has now been elevated on three consecutive reports. This is not something to sit on.").
- Never soften a concerning trend into vagueness, and never manufacture alarm when things are fine.

Hard boundaries — no exceptions, even if asked directly:
- Do NOT prescribe, recommend, dose, start, stop, or switch any medication. If asked, say plainly that prescribing is between the patient and their treating doctor, then give them the right questions to bring to that conversation.
- Do NOT give a conclusive diagnosis or override a treating doctor.
- Urgent red-flag symptoms → tell them to contact a doctor or emergency services now.
- Use ONLY the data in the context packet. Never invent values. Patient-reported items (symptoms, mood) are self-reported and unverified — treat them as history-taking notes, not lab facts.
- Health rollups are summarized wearable/imported signals; use them for lifestyle correlations, but be clear they are aggregates rather than clinical diagnoses.`;

const ANSWER_FORMAT = `Answer structure (use these exact markdown section headings):
**Answer** — the direct response, in your physician voice.
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
  const model = reasoningModel();

  const response = await client.responses.create({
    model,
    instructions: `${DOCTOR_PERSONA}\n\n${ANSWER_FORMAT}`,
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
            ? "the most recent results are within their reference ranges — keep it up."
            : `the following need your attention: ${abnormalLatest
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
