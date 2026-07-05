import OpenAI from "openai";
import { z } from "zod";
import { asc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { buildAiContext, type AiContext } from "./context";
import { DOCTOR_PERSONA } from "./answer";
import { reasoningModel } from "./models";

const insightSchema = z.object({
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(600),
  tone: z.enum(["encouraging", "neutral", "warning", "stern"]),
  category: z.string().max(40).nullable(),
});
const insightsResponseSchema = z.object({ insights: z.array(insightSchema).min(1).max(5) });

const INSIGHTS_PROMPT = `From the patient's context packet, write 3-5 key insights they should see when they open their health assistant — before asking anything.

Each insight: a short punchy title and a 1-3 sentence body in your physician voice.
- tone "encouraging": values in range, improving trends, good habits. Celebrate specifically.
- tone "stern": worsening or repeatedly abnormal values, concerning combinations (e.g. high TG + low HDL + rising ALT). Be direct about why it matters and what kind of follow-up conversation to have with their treating doctor.
- tone "warning": borderline values or gaps worth watching (e.g. no follow-up test in over a year).
- tone "neutral": useful context that is neither.
Prioritize what matters clinically. Never recommend, start, stop or dose any medication. category: one word like liver, lipid, glucose, vitamin, lifestyle.`;

const INSIGHTS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["insights"],
  properties: {
    insights: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "body", "tone", "category"],
        properties: {
          title: { type: "string" },
          body: { type: "string" },
          tone: { type: "string", enum: ["encouraging", "neutral", "warning", "stern"] },
          category: { type: ["string", "null"] },
        },
      },
    },
  },
} as const;

/** Cheap change-detector: regenerate insights only when the underlying data moved. */
async function dataFingerprint(profileId: string): Promise<string> {
  const result = await db.execute(sql`
    SELECT concat(
      (SELECT count(*) FROM observations WHERE profile_id = ${profileId} AND status = 'confirmed'), ':',
      (SELECT coalesce(max(updated_at)::text, '') FROM observations WHERE profile_id = ${profileId} AND status = 'confirmed'), ':',
      (SELECT count(*) FROM medication_events WHERE profile_id = ${profileId}), ':',
      (SELECT count(*) FROM conversation_datapoints WHERE profile_id = ${profileId}), ':',
      (SELECT count(*) FROM clinical_reports WHERE profile_id = ${profileId})
    ) AS fp
  `);
  return (result.rows[0] as { fp: string }).fp;
}

type NewInsight = z.infer<typeof insightSchema>;

/** Deterministic insights when no API key is configured. */
function mockInsights(context: AiContext): NewInsight[] {
  const out: NewInsight[] = [];
  const latestByTest = new Map<string, AiContext["observations"][number]>();
  for (const o of context.observations) latestByTest.set(o.test, o);
  const latest = [...latestByTest.values()];
  const abnormal = latest.filter(
    (o) => o.interpretation === "high" || o.interpretation === "low" || o.interpretation === "critical"
  );
  const normal = latest.filter((o) => o.interpretation === "normal");

  if (abnormal.length > 0) {
    out.push({
      title: `${abnormal.length} value${abnormal.length === 1 ? "" : "s"} out of range`,
      body: `${abnormal
        .slice(0, 5)
        .map((o) => `${o.test} (${o.value} ${o.unit ?? ""}, ${o.interpretation})`)
        .join("; ")}. These aren't going to sort themselves out — book the follow-up.`,
      tone: "stern",
      category: abnormal[0].category,
    });
  }
  if (normal.length > 0) {
    out.push({
      title: `${normal.length} value${normal.length === 1 ? "" : "s"} in range`,
      body: `${normal
        .slice(0, 6)
        .map((o) => o.test)
        .join(", ")} all look good. Whatever you're doing there, keep doing it.`,
      tone: "encouraging",
      category: null,
    });
  }
  const recentSymptoms = context.patientReported.filter((d) => d.kind === "symptom").slice(0, 3);
  if (recentSymptoms.length > 0) {
    out.push({
      title: "Symptoms you've mentioned",
      body: `You've reported: ${recentSymptoms.map((s) => s.label).join(", ")}. Worth raising with your doctor alongside the lab picture.`,
      tone: "warning",
      category: "reported",
    });
  }
  if (out.length === 0) {
    out.push({
      title: "No confirmed data yet",
      body: "Upload and confirm a lab report and I'll start flagging what matters here.",
      tone: "neutral",
      category: null,
    });
  }
  return out.slice(0, 5);
}

export async function getInsights(profileId: string) {
  return db.query.aiInsights.findMany({
    where: eq(schema.aiInsights.profileId, profileId),
    orderBy: [asc(schema.aiInsights.createdAt)],
  });
}

/**
 * Generates (or reuses) pre-computed insights for a profile. The LLM cost is
 * paid when data changes — viewing the Ask tab is free.
 */
export async function generateInsights(
  profileId: string,
  opts: { force?: boolean } = {}
) {
  const fingerprint = await dataFingerprint(profileId);
  const existing = await getInsights(profileId);
  if (!opts.force && existing.length > 0 && existing[0].dataFingerprint === fingerprint) {
    return existing;
  }

  // Known names for redaction: profile owner's family.
  const profile = await db.query.profiles.findFirst({
    where: eq(schema.profiles.id, profileId),
  });
  if (!profile) throw new Error("Profile not found");
  const family = await db.query.profiles.findMany({
    where: eq(schema.profiles.userId, profile.userId),
  });
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, profile.userId),
  });
  const knownNames = [
    user?.name ?? "",
    ...family.flatMap((p) => p.displayName.split(/\s+/)),
  ].filter(Boolean);

  const context = await buildAiContext(profileId, knownNames);

  let insights: NewInsight[];
  let model: string;
  if (process.env.OPENAI_API_KEY) {
    const client = new OpenAI();
    model = reasoningModel();
    const response = await client.responses.create({
      model,
      instructions: `${DOCTOR_PERSONA}\n\n${INSIGHTS_PROMPT}`,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Context packet (confirmed data only, PII redacted):\n${JSON.stringify(context, null, 1)}`,
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "key_insights",
          schema: INSIGHTS_JSON_SCHEMA as unknown as Record<string, unknown>,
          strict: true,
        },
      },
    });
    insights = insightsResponseSchema.parse(JSON.parse(response.output_text)).insights;
  } else {
    model = "mock";
    insights = mockInsights(context);
  }

  const rows = await db.transaction(async (tx) => {
    await tx.delete(schema.aiInsights).where(eq(schema.aiInsights.profileId, profileId));
    return tx
      .insert(schema.aiInsights)
      .values(
        insights.map((i) => ({
          profileId,
          title: i.title,
          body: i.body,
          tone: i.tone,
          category: i.category,
          model,
          dataFingerprint: fingerprint,
        }))
      )
      .returning();
  });
  return rows;
}

/** Fire-and-forget wrapper for post-write hooks. */
export function scheduleInsightRefresh(profileId: string) {
  generateInsights(profileId, { force: true }).catch((e) =>
    console.error("insight refresh failed", e)
  );
}
