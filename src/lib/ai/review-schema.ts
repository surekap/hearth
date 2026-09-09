import { z } from "zod";

const citedTextSchema = z.object({ text: z.string(), evidenceIds: z.array(z.string()) });
/** Model chooses evidence, never chart values, file URLs, or clinical colours. */
export const analysisSchema = z.object({
  overview: citedTextSchema,
  findings: z.array(z.object({
    title: z.string(),
    ...citedTextSchema.shape,
    priority: z.enum(["attention", "improvement", "context"]),
    uncertainty: z.string().nullable(),
  })),
  visuals: z.array(z.object({
    type: z.enum(["trend", "values", "timeline"]),
    title: z.string(),
    evidenceIds: z.array(z.string()),
  })),
  nextSteps: z.array(citedTextSchema),
  limitations: z.array(z.string()),
});
export type Analysis = z.infer<typeof analysisSchema>;
const sourceSchema = z.object({
  id: z.string(), label: z.string(), date: z.string().nullable(),
  documentId: z.string().uuid().nullable(), page: z.number().int().positive().nullable(),
});
const pointSchema = z.object({
  id: z.string(), label: z.string(), date: z.string().nullable(),
  value: z.union([z.number(), z.string(), z.null()]), unit: z.string().nullable(),
  referenceLow: z.number().nullable(), referenceHigh: z.number().nullable(),
});
export const reviewBlockSchema = z.object({
  type: z.literal("review"), version: z.literal(1),
  overviewEvidenceIds: z.array(z.string()),
  findings: analysisSchema.shape.findings,
  visuals: z.array(z.object({
    type: z.enum(["trend", "values", "timeline"]), title: z.string(),
    points: z.array(pointSchema), caveat: z.string().nullable(),
  })),
  nextSteps: analysisSchema.shape.nextSteps,
  limitations: z.array(z.string()),
  sources: z.array(sourceSchema),
  coverage: z.string(),
});
export type ReviewBlock = z.infer<typeof reviewBlockSchema>;
