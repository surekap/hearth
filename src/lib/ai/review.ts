import { analysisSchema, reviewBlockSchema, type Analysis, type ReviewBlock } from "./review-schema";
import { comparisonCaveat, type Evidence } from "./evidence";

/** These checks establish referential/visual integrity, not medical correctness. */
export function validateAnalysis(raw: unknown, evidence: Evidence[]): Analysis {
  const analysis = analysisSchema.parse(raw);
  if (!analysis.overview.text.trim()) throw new Error("Empty overview");
  if (analysis.findings.length > 12 || analysis.visuals.length > 4 || analysis.nextSteps.length > 6) throw new Error("Too many answer sections");
  if (analysis.visuals.some((v) => v.evidenceIds.length > 24)) throw new Error("Select at most 24 readings per visual");
  const ids = new Set(evidence.map((e) => e.id));
  for (const section of [analysis.overview, ...analysis.findings, ...analysis.visuals, ...analysis.nextSteps]) {
    if (section.evidenceIds.some((id) => !ids.has(id))) throw new Error("Answer references evidence that was not supplied");
  }
  for (const finding of analysis.findings) {
    if (!finding.evidenceIds.length) throw new Error("A record finding needs supporting evidence");
  }
  return analysis;
}

export function buildReview(analysis: Analysis, evidence: Evidence[], coverage: string): ReviewBlock {
  const byId = new Map(evidence.map((e) => [e.id, e]));
  const used = new Set([
    ...analysis.overview.evidenceIds,
    ...analysis.findings.flatMap((f) => f.evidenceIds),
    ...analysis.nextSteps.flatMap((s) => s.evidenceIds),
  ]);
  const limitations = [...analysis.limitations];
  const visuals: ReviewBlock["visuals"] = [];
  for (const request of analysis.visuals) {
    const points = [...new Set(request.evidenceIds)].map((id) => byId.get(id)!).filter(Boolean)
      .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
    if (!points.length) continue;
    points.forEach((p) => used.add(p.id));
    if (request.type === "timeline") {
      const reports = points.filter((p) => p.kind === "report" || p.kind === "diagnosis");
      if (!reports.length) continue;
      visuals.push({ type: "timeline", title: request.title, caveat: null, points: reports.map((p) => ({
        id: p.id, label: p.label, date: p.date, value: String(p.data.impression || p.data.summary || p.label),
        unit: null, referenceLow: null, referenceHigh: null,
      })) });
      continue;
    }
    const measurements = points.filter((p) => p.kind === "observation");
    if (!measurements.length) continue;
    const caveat = request.type === "trend" ? comparisonCaveat(measurements) : null;
    const canTrend = request.type === "trend" && !caveat && measurements.length >= 2 &&
      measurements.every((p) => typeof p.data.value === "number" && Number.isFinite(p.data.value) && p.date);
    if (caveat) limitations.push(caveat);
    visuals.push({ type: canTrend ? "trend" : "values", title: request.title, caveat,
      points: measurements.map((p) => ({
        id: p.id, label: p.label, date: p.date,
        value: typeof p.data.value === "number" || typeof p.data.value === "string" ? p.data.value : null,
        unit: typeof p.data.unit === "string" ? p.data.unit : null,
        referenceLow: typeof p.data.referenceLow === "number" ? p.data.referenceLow : null,
        referenceHigh: typeof p.data.referenceHigh === "number" ? p.data.referenceHigh : null,
      })),
    });
  }
  // Comparability warnings remain visible even when the model chooses prose.
  const series = new Map<string, Evidence[]>();
  for (const e of evidence.filter((e) => used.has(e.id) && e.kind === "observation")) {
    series.set(e.label, [...(series.get(e.label) ?? []), e]);
  }
  for (const points of series.values()) {
    const caveat = comparisonCaveat(points);
    if (caveat && !visuals.some((v) => v.caveat === caveat && v.points.some((p) => p.label === points[0].label))) limitations.push(`${points[0].label}: ${caveat}`);
  }
  return reviewBlockSchema.parse({
    type: "review", version: 1, overviewEvidenceIds: analysis.overview.evidenceIds,
    findings: analysis.findings, visuals, nextSteps: analysis.nextSteps,
    limitations: [...new Set(limitations)], coverage,
    sources: [...used].map((id) => byId.get(id)!).filter(Boolean).map((e) => ({
      id: e.id, label: e.label, date: e.date, documentId: e.documentId, page: e.page,
    })),
  });
}
