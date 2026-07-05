import OpenAI from "openai";
import { z } from "zod";
import { db, schema } from "@/db";
import { extractionModel } from "./models";

const datapointSchema = z.object({
  kind: z.enum(["symptom", "mood", "sleep", "lifestyle", "medication_mention", "other"]),
  label: z.string().min(1).max(120),
  detail: z.string().max(500).nullable(),
  severity: z.enum(["mild", "moderate", "severe"]).nullable(),
});
const datapointsResponseSchema = z.object({ datapoints: z.array(datapointSchema).max(8) });

export type CapturedDatapoint = z.infer<typeof datapointSchema>;

const CAPTURE_PROMPT = `You extract patient-reported health data points from a message a patient sent to their family health record assistant.

Capture ONLY concrete, first-person health information the patient states about themselves:
- symptom: "I've had headaches all week" → {kind:"symptom", label:"headaches", detail:"all week", severity:"mild"}
- mood: "feeling really anxious lately" → {kind:"mood", label:"anxious", detail:"lately"}
- sleep: "only slept 4 hours" → {kind:"sleep", label:"4 hours sleep"}
- lifestyle: "started running 5k daily", "quit smoking"
- medication_mention: "I stopped taking the metformin" (mention only — record, don't judge)

Do NOT capture: questions, hypotheticals, references to lab values already in the record, information about other people, or vague statements with no health content. When in doubt, capture nothing. Return {"datapoints": []} for pure questions.`;

const CAPTURE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["datapoints"],
  properties: {
    datapoints: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "label", "detail", "severity"],
        properties: {
          kind: {
            type: "string",
            enum: ["symptom", "mood", "sleep", "lifestyle", "medication_mention", "other"],
          },
          label: { type: "string" },
          detail: { type: ["string", "null"] },
          severity: { type: ["string", "null"], enum: ["mild", "moderate", "severe", null] },
        },
      },
    },
  },
} as const;

/** Keyword fallback when no API key is configured. */
function heuristicCapture(message: string): CapturedDatapoint[] {
  const m = message.toLowerCase();
  const out: CapturedDatapoint[] = [];
  const symptomWords = [
    "headache", "nausea", "fatigue", "tired", "dizzy", "fever", "pain",
    "cough", "insomnia", "cramp", "bloating", "rash", "palpitation",
  ];
  const moodWords = ["anxious", "stressed", "depressed", "low mood", "irritable", "overwhelmed"];
  for (const w of symptomWords) {
    if (m.includes(w) && /\b(i|my|me|i've|i'm|been|feeling|having|had)\b/.test(m)) {
      out.push({ kind: "symptom", label: w, detail: null, severity: null });
    }
  }
  for (const w of moodWords) {
    if (m.includes(w) && /\b(i|i've|i'm|feeling|been)\b/.test(m)) {
      out.push({ kind: "mood", label: w, detail: null, severity: null });
    }
  }
  const sleep = m.match(/slept (?:only )?(\d+(?:\.\d+)?) ?hours?/);
  if (sleep) out.push({ kind: "sleep", label: `${sleep[1]} hours sleep`, detail: null, severity: null });
  return out.slice(0, 4);
}

export async function extractDatapoints(message: string): Promise<CapturedDatapoint[]> {
  if (!process.env.OPENAI_API_KEY) return heuristicCapture(message);
  try {
    const client = new OpenAI();
    const response = await client.responses.create({
      model: extractionModel(),
      instructions: CAPTURE_PROMPT,
      input: [{ role: "user", content: [{ type: "input_text", text: message }] }],
      text: {
        format: {
          type: "json_schema",
          name: "patient_datapoints",
          schema: CAPTURE_JSON_SCHEMA as unknown as Record<string, unknown>,
          strict: true,
        },
      },
    });
    return datapointsResponseSchema.parse(JSON.parse(response.output_text)).datapoints;
  } catch (e) {
    console.error("datapoint capture failed", e);
    return [];
  }
}

export async function storeDatapoints(
  profileId: string,
  aiContextLogId: string | null,
  datapoints: CapturedDatapoint[]
) {
  if (datapoints.length === 0) return [];
  const rows = await db
    .insert(schema.conversationDatapoints)
    .values(
      datapoints.map((d) => ({
        profileId,
        aiContextLogId,
        kind: d.kind,
        label: d.label,
        detail: d.detail,
        severity: d.severity,
      }))
    )
    .returning();
  return rows;
}
