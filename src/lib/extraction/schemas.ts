import { z } from "zod";

export const PROMPT_VERSION = "v1";

export const extractedObservationSchema = z.object({
  test_name: z.string(),
  canonical_name: z.string().nullable(),
  value: z.number().nullable(),
  value_text: z.string().nullable(),
  unit: z.string().nullable(),
  reference_low: z.number().nullable(),
  reference_high: z.number().nullable(),
  interpretation: z.enum(["low", "normal", "high", "critical", "unknown"]),
  confidence: z.number().min(0).max(1),
});

export const extractedReportSchema = z.object({
  modality: z.string().nullable(),
  body_part: z.string().nullable(),
  specialty: z.string().nullable(),
  facility: z.string().nullable(),
  doctor_name: z.string().nullable(),
  findings: z.array(z.string()),
  impression: z.string().nullable(),
  summary: z.string().nullable(),
  follow_up_recommended: z.boolean(),
  confidence: z.number().min(0).max(1),
});

export const extractedMedicationSchema = z.object({
  brand_name: z.string().nullable(),
  generic_name: z.string().nullable(),
  strength: z.string().nullable(),
  dose: z.string().nullable(),
  frequency: z.string().nullable(),
  duration: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

export const extractionResultSchema = z.object({
  document_type: z.enum([
    "lab_report",
    "prescription",
    "imaging",
    "specialist_report",
    "discharge_summary",
    "invoice",
    "other",
  ]),
  report_date: z.string().nullable(),
  lab_name: z.string().nullable(),
  patient_name: z.string().nullable(),
  raw_text: z.string(),
  observations: z.array(extractedObservationSchema),
  report: extractedReportSchema.nullable(),
  medications: z.array(extractedMedicationSchema),
  warnings: z.array(z.string()),
  uncertain_items: z.array(z.string()),
});

export type ExtractionResult = z.infer<typeof extractionResultSchema>;
export type ExtractedObservation = z.infer<typeof extractedObservationSchema>;

/** OpenAI strict structured-output JSON schema mirroring extractionResultSchema. */
export const OPENAI_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "document_type",
    "report_date",
    "lab_name",
    "patient_name",
    "raw_text",
    "observations",
    "report",
    "medications",
    "warnings",
    "uncertain_items",
  ],
  properties: {
    document_type: {
      type: "string",
      enum: [
        "lab_report",
        "prescription",
        "imaging",
        "specialist_report",
        "discharge_summary",
        "invoice",
        "other",
      ],
    },
    report_date: { type: ["string", "null"], description: "ISO date YYYY-MM-DD" },
    lab_name: { type: ["string", "null"] },
    patient_name: {
      type: ["string", "null"],
      description: "Patient name exactly as printed, used only for profile matching",
    },
    raw_text: {
      type: "string",
      description: "Full transcription of all text in the document",
    },
    observations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "test_name",
          "canonical_name",
          "value",
          "value_text",
          "unit",
          "reference_low",
          "reference_high",
          "interpretation",
          "confidence",
        ],
        properties: {
          test_name: { type: "string", description: "Test name exactly as printed" },
          canonical_name: {
            type: ["string", "null"],
            description: "Standardized test name, e.g. ALT for SGPT",
          },
          value: { type: ["number", "null"] },
          value_text: {
            type: ["string", "null"],
            description: "Non-numeric result, e.g. 'Positive'",
          },
          unit: { type: ["string", "null"] },
          reference_low: { type: ["number", "null"] },
          reference_high: { type: ["number", "null"] },
          interpretation: {
            type: "string",
            enum: ["low", "normal", "high", "critical", "unknown"],
          },
          confidence: { type: "number" },
        },
      },
    },
    report: {
      type: ["object", "null"],
      additionalProperties: false,
      required: [
        "modality",
        "body_part",
        "specialty",
        "facility",
        "doctor_name",
        "findings",
        "impression",
        "summary",
        "follow_up_recommended",
        "confidence",
      ],
      properties: {
        modality: { type: ["string", "null"] },
        body_part: { type: ["string", "null"] },
        specialty: { type: ["string", "null"] },
        facility: { type: ["string", "null"] },
        doctor_name: { type: ["string", "null"] },
        findings: { type: "array", items: { type: "string" } },
        impression: { type: ["string", "null"] },
        summary: { type: ["string", "null"] },
        follow_up_recommended: { type: "boolean" },
        confidence: { type: "number" },
      },
    },
    medications: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "brand_name",
          "generic_name",
          "strength",
          "dose",
          "frequency",
          "duration",
          "confidence",
        ],
        properties: {
          brand_name: { type: ["string", "null"] },
          generic_name: { type: ["string", "null"] },
          strength: { type: ["string", "null"] },
          dose: { type: ["string", "null"] },
          frequency: { type: ["string", "null"] },
          duration: { type: ["string", "null"] },
          confidence: { type: "number" },
        },
      },
    },
    warnings: { type: "array", items: { type: "string" } },
    uncertain_items: { type: "array", items: { type: "string" } },
  },
} as const;
