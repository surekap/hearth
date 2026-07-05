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

export const extractedGeneticReportSchema = z.object({
  vendor: z.string().nullable(),
  report_name: z.string().nullable(),
  test_kind: z
    .enum(["predisposition", "pharmacogenomics", "carrier", "raw_genotype", "other"])
    .nullable(),
  genome_build: z.string().nullable(),
  summary: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

export const extractedGeneticVariantSchema = z.object({
  gene: z.string().nullable(),
  variant_id: z.string().nullable(),
  marker: z.string().nullable(),
  chromosome: z.string().nullable(),
  position: z.string().nullable(),
  genotype: z.string().nullable(),
  phenotype: z.string().nullable(),
  source_section: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

export const extractedGeneticRiskSchema = z.object({
  category: z.enum(["disease", "trait"]),
  condition_name: z.string(),
  assessment: z.string().nullable(),
  risk_level: z.enum(["low", "normal", "medium", "high", "unknown"]),
  lifetime_risk_percent: z.number().nullable(),
  population_risk_percent: z.number().nullable(),
  variant_score: z.string().nullable(),
  summary: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

export const extractedPharmacogenomicResultSchema = z.object({
  drug_name: z.string(),
  gene: z.string().nullable(),
  genotype: z.string().nullable(),
  phenotype: z.string().nullable(),
  implication: z.string(),
  actionability: z.enum(["informational", "actionable", "high_impact", "unknown"]),
  recommendation_summary: z.string().nullable(),
  evidence_level: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

export const extractionResultSchema = z.object({
  document_type: z.enum([
    "lab_report",
    "prescription",
    "imaging",
    "specialist_report",
    "discharge_summary",
    "genetic_report",
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
  genetic_report: extractedGeneticReportSchema.nullable(),
  genetic_variants: z.array(extractedGeneticVariantSchema),
  genetic_risks: z.array(extractedGeneticRiskSchema),
  pharmacogenomics: z.array(extractedPharmacogenomicResultSchema),
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
    "genetic_report",
    "genetic_variants",
    "genetic_risks",
    "pharmacogenomics",
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
        "genetic_report",
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
    genetic_report: {
      type: ["object", "null"],
      additionalProperties: false,
      required: [
        "vendor",
        "report_name",
        "test_kind",
        "genome_build",
        "summary",
        "confidence",
      ],
      properties: {
        vendor: { type: ["string", "null"] },
        report_name: { type: ["string", "null"] },
        test_kind: {
          type: ["string", "null"],
          enum: ["predisposition", "pharmacogenomics", "carrier", "raw_genotype", "other", null],
        },
        genome_build: { type: ["string", "null"] },
        summary: { type: ["string", "null"] },
        confidence: { type: "number" },
      },
    },
    genetic_variants: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "gene",
          "variant_id",
          "marker",
          "chromosome",
          "position",
          "genotype",
          "phenotype",
          "source_section",
          "confidence",
        ],
        properties: {
          gene: { type: ["string", "null"] },
          variant_id: { type: ["string", "null"], description: "rsID, star allele, HLA tag, or other printed marker id" },
          marker: { type: ["string", "null"] },
          chromosome: { type: ["string", "null"] },
          position: { type: ["string", "null"] },
          genotype: { type: ["string", "null"] },
          phenotype: { type: ["string", "null"] },
          source_section: { type: ["string", "null"] },
          confidence: { type: "number" },
        },
      },
    },
    genetic_risks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "category",
          "condition_name",
          "assessment",
          "risk_level",
          "lifetime_risk_percent",
          "population_risk_percent",
          "variant_score",
          "summary",
          "confidence",
        ],
        properties: {
          category: { type: "string", enum: ["disease", "trait"] },
          condition_name: { type: "string" },
          assessment: { type: ["string", "null"] },
          risk_level: { type: "string", enum: ["low", "normal", "medium", "high", "unknown"] },
          lifetime_risk_percent: { type: ["number", "null"] },
          population_risk_percent: { type: ["number", "null"] },
          variant_score: { type: ["string", "null"] },
          summary: { type: ["string", "null"] },
          confidence: { type: "number" },
        },
      },
    },
    pharmacogenomics: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "drug_name",
          "gene",
          "genotype",
          "phenotype",
          "implication",
          "actionability",
          "recommendation_summary",
          "evidence_level",
          "confidence",
        ],
        properties: {
          drug_name: { type: "string" },
          gene: { type: ["string", "null"] },
          genotype: { type: ["string", "null"] },
          phenotype: { type: ["string", "null"] },
          implication: { type: "string" },
          actionability: { type: "string", enum: ["informational", "actionable", "high_impact", "unknown"] },
          recommendation_summary: {
            type: ["string", "null"],
            description: "Doctor-discussion implication only; never prescribe or dose.",
          },
          evidence_level: { type: ["string", "null"] },
          confidence: { type: "number" },
        },
      },
    },
    warnings: { type: "array", items: { type: "string" } },
    uncertain_items: { type: "array", items: { type: "string" } },
  },
} as const;
