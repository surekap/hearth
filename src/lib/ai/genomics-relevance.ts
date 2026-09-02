import type { AiContext } from "./context";

/**
 * Genomic data is static, often years old, and mostly noise for an everyday
 * "how are my labs" question — yet it was shipped with every packet. It only
 * belongs in the context when the question is about genetics or names a drug
 * the pharmacogenomic results have something to say about.
 */
const GENETIC_WORDS =
  /\b(gene|genes|genetic|genetics|genom\w*|dna|variant|variants|mutation|hereditary|inherit\w*|pharmacogen\w*|predisposition|carrier|brca|apoe|mthfr|cyp\w*)\b/i;
const DRUG_WORDS =
  /\b(drug|drugs|medication|medications|medicine|medicines|meds|tablet|tablets|prescri\w*|dose|dosage|statin|metformin|warfarin|clopidogrel|codeine|ibuprofen|paracetamol|antidepressant)\b/i;

export function isGenomicsRelevant(question: string, context: AiContext): boolean {
  if (GENETIC_WORDS.test(question)) return true;
  const q = question.toLowerCase();
  const namedDrug = context.genomics.pharmacogenomics.some((p) => {
    const drug = p.drug.trim().toLowerCase();
    return drug.length >= 3 && q.includes(drug);
  });
  if (namedDrug) return true;
  // A general medication question with pharmacogenomic results on file.
  return DRUG_WORDS.test(question) && context.genomics.pharmacogenomics.length > 0;
}

/** Drops genomics from the packet unless the question needs it. */
export function scopeGenomics(question: string, context: AiContext): AiContext {
  if (isGenomicsRelevant(question, context)) return context;
  return { ...context, genomics: { reports: [], risks: [], pharmacogenomics: [] } };
}
