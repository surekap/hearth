import OpenAI from "openai";
import { extractionModel } from "@/lib/ai/models";
import {
  extractionResultSchema,
  OPENAI_JSON_SCHEMA,
  type ExtractionResult,
  PROMPT_VERSION,
} from "./schemas";

export type ProviderOutput = {
  result: ExtractionResult;
  model: string;
  promptVersion: string;
  inputTokens: number | null;
  outputTokens: number | null;
  engine: string;
};

const SYSTEM_PROMPT = `You are a meticulous medical document extraction engine for a personal health record.
You receive a single medical document (lab report, prescription, imaging/specialist report, discharge summary, genetic report, or invoice), usually from an Indian lab such as Apollo Diagnostics.

Rules:
- Extract ONLY what is printed. Never invent values, units or reference ranges.
- Inspect every page of multi-page PDFs. Do not stop at the first page or the visible preview.
- Transcribe every test result you can find, including sub-panels and repeated table continuations.
- canonical_name: map local names to international standard names (SGPT→ALT, SGOT→AST, "Glycosylated Hb"→HbA1c). Null if unsure.
- For allergy/specific-IgE panels, every allergen row is a separate lab observation. Keep test_name as printed; use canonical_name "<Allergen> IgE" for allergen-specific IgE rows where the printed name omits IgE.
- Numeric results go in "value"; qualitative results ("Positive", "Trace") go in "value_text".
- Reference ranges: parse "0-45", "< 150", "> 40" into reference_low / reference_high, leaving the missing side null.
- interpretation: judge from the printed value vs printed range (or printed H/L flags). "unknown" if no range.
- report_date: the sample collection or report date printed on the document, ISO YYYY-MM-DD. Null if absent.
- raw_text: full plain-text transcription of the document.
- confidence: your certainty (0-1) that the row was read correctly.
- Anything ambiguous goes into uncertain_items; document-level problems into warnings.
- For non-lab documents fill the "report" object; for prescriptions fill "medications".
- Respect the uploaded document type hint when it is not "other". If the hint is "genetic_report", keep observations empty unless the document prints true clinical lab-result rows.
- For genetic reports:
  - Set document_type to "genetic_report".
  - Fill genetic_report with vendor/report metadata.
  - Put disease predispositions and traits in genetic_risks. Use category "disease" or "trait".
  - Put SNPs/star alleles/HLA tags/genotypes in genetic_variants when printed.
  - Put drug response rows in pharmacogenomics.
  - Preserve the report's wording, and do not upgrade predisposition into diagnosis or prescribing advice.`;

export async function extractWithOpenAI(input: {
  buffer: Buffer;
  mimeType: string;
  filename: string;
  documentTypeHint: string;
  signal?: AbortSignal;
}): Promise<ProviderOutput> {
  const client = new OpenAI();
  const model = extractionModel();

  const base64 = input.buffer.toString("base64");
  const filePart =
    input.mimeType === "application/pdf"
      ? {
          type: "input_file" as const,
          filename: input.filename || "document.pdf",
          file_data: `data:application/pdf;base64,${base64}`,
        }
      : {
          type: "input_image" as const,
          image_url: `data:${input.mimeType};base64,${base64}`,
          detail: "high" as const,
        };

  const response = await client.responses.create(
    {
      model,
      instructions: SYSTEM_PROMPT,
      max_output_tokens: 16000,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Uploaded document type hint: ${input.documentTypeHint}. Extract structured data from this medical document. Return the strict JSON only.`,
            },
            filePart,
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "medical_extraction",
          schema: OPENAI_JSON_SCHEMA as unknown as Record<string, unknown>,
          strict: true,
        },
      },
    },
    { maxRetries: 0, signal: input.signal, timeout: 240_000 }
  );

  const raw = response.output_text;
  const result = extractionResultSchema.parse(JSON.parse(raw));

  return {
    result,
    model,
    promptVersion: PROMPT_VERSION,
    inputTokens: response.usage?.input_tokens ?? null,
    outputTokens: response.usage?.output_tokens ?? null,
    engine: `openai:${model}`,
  };
}
