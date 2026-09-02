/**
 * Links a medication the person takes to a pharmacogenomic result on file,
 * so the warning appears where the medicine is, not buried on a genetics page.
 * Pure logic, no DB access.
 */

export type PgxResult = {
  drugName: string;
  gene: string | null;
  phenotype: string | null;
  implication: string;
  actionability: string;
  recommendationSummary: string | null;
};

export type PgxWarning = {
  drug: string;
  gene: string | null;
  phenotype: string | null;
  implication: string;
  actionability: string;
  recommendation: string | null;
};

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * A medication name matches a result when the result's drug name appears as a
 * whole word in it ("Clopidogrel 75mg" ↔ "clopidogrel"). Names under three
 * characters are ignored: they match inside unrelated words.
 */
export function matchPharmacogenomics(medicationName: string, results: PgxResult[]): PgxWarning[] {
  const haystack = ` ${normalize(medicationName)} `;
  const warnings: PgxWarning[] = [];
  for (const result of results) {
    const drug = normalize(result.drugName);
    if (drug.length < 3) continue;
    if (!haystack.includes(` ${drug} `)) continue;
    if (result.actionability === "informational" || result.actionability === "unknown") continue;
    warnings.push({
      drug: result.drugName,
      gene: result.gene,
      phenotype: result.phenotype,
      implication: result.implication,
      actionability: result.actionability,
      recommendation: result.recommendationSummary,
    });
  }
  return warnings;
}
