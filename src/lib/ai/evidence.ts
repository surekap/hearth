import type { AiContext } from "./context";
import { parseWindowMonths } from "./changes";
import { scopeGenomics } from "./genomics-relevance";

export type DateScope = { from: string | null; to: string; label: string };
export type Evidence = {
  id: string;
  kind: "observation" | "report" | "diagnosis" | "medication" | "snippet";
  label: string;
  date: string | null;
  documentId: string | null;
  page: number | null;
  data: Record<string, unknown>;
};
export type HistoryTurn = { question: string; answer: string };
const MONTHS = "january february march april may june july august september october november december".split(" ");

export function resolveDateScope(question: string, now = new Date()): DateScope {
  const today = now.toISOString().slice(0, 10);
  const iso = question.match(/\b20\d{2}-\d{2}-\d{2}\b/g)?.filter((d) => {
    const parsed = new Date(d);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === d;
  });
  if (iso?.length) return { from: iso[0], to: iso.at(-1) === iso[0] ? today : iso.at(-1)!, label: question };
  const years = question.match(/\b20\d{2}\b/g);
  if (years?.length) {
    const months = [...question.toLowerCase().matchAll(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/g)]
      .map((m) => MONTHS.findIndex((name) => name.startsWith(m[1].slice(0, 3))));
    const fromMonth = months[0] ?? 0;
    const toMonth = months.at(-1) ?? 11;
    const startYear = Number(years[0]);
    const endYear = Number(years.at(-1));
    return {
      from: `${startYear}-${String(fromMonth + 1).padStart(2, "0")}-01`,
      to: new Date(Date.UTC(endYear, toMonth + 1, 0)).toISOString().slice(0, 10),
      label: question,
    };
  }
  const months = parseWindowMonths(question);
  if (months !== null) {
    const start = new Date(now);
    start.setUTCMonth(start.getUTCMonth() - months);
    return { from: start.toISOString().slice(0, 10), to: today, label: `Last ${months} months` };
  }
  return { from: null, to: today, label: "Available history" };
}

/** Keep whole recent turns, not arbitrary character slices that lose caveats. */
export function budgetHistory(history: HistoryTurn[], maxChars = 12000): HistoryTurn[] {
  const selected: HistoryTurn[] = [];
  let size = 0;
  for (const turn of [...history].reverse()) {
    const cost = JSON.stringify(turn).length;
    if (size + cost > maxChars) break;
    selected.unshift(turn);
    size += cost;
  }
  return selected;
}

export function retrievalQuestion(question: string, history: HistoryTurn[]): string {
  // The immediate antecedent resolves short follow-ups; do not concatenate the
  // entire conversation into a growing, contradictory search query.
  return /\b(that|those|these|it|this|same|above|about|and why)\b/i.test(question) && history.length
    ? `${history.at(-1)!.question}\nFollow-up: ${question}` : question;
}

function compact(data: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(data).filter(([, v]) => v !== null && v !== undefined && v !== ""));
}

// Columnar transport removes repeated JSON keys, without summarizing away
// numeric readings, reference ranges, qualifiers or source provenance.
const OBSERVATION_COLUMNS = ["id", "label", "date", "value", "unit", "referenceLow", "referenceHigh", "interpretation", "category", "study", "originalName", "device", "confidence", "source", "role"];
function observationRow(e: Record<string, unknown>) {
  const row = OBSERVATION_COLUMNS.map((key) => e[key] ?? null);
  while (row.length && row.at(-1) === null) row.pop();
  return row;
}
export function compactEvidencePacket<T extends { evidence: Record<string, unknown>[]; catalog: { id: string; kind: string; label: string; date: string | null }[] }>(packet: T) {
  return { ...packet,
    evidence: packet.evidence.filter((e) => e.kind !== "observation"),
    observations: { columns: OBSERVATION_COLUMNS, rows: packet.evidence.filter((e) => e.kind === "observation").map(observationRow) },
    catalog: { columns: ["id", "kind", "label", "date"], rows: packet.catalog.map((e) => [e.id, e.kind, e.label, e.date]) },
  };
}

export function collectEvidence(context: AiContext): Evidence[] {
  const all: Evidence[] = [];
  const add = (kind: Evidence["kind"], label: string, date: string | null, data: Record<string, unknown>, documentId: string | null = null, page: number | null = null) => {
    all.push({ id: `E${all.length + 1}`, kind, label, date, documentId, page, data: compact(data) });
  };
  for (const r of context.reports) add("report", r.study ?? r.type, r.date, {
    summary: r.summary, findings: r.findings, impression: r.impression, modality: r.modality, facility: r.facility,
  }, r.documentId, r.page);
  for (const d of context.diagnoses) add("diagnosis", d.condition, d.recordedDate, {
    severity: d.severity, status: d.status, certainty: d.certainty, onset: d.onsetDate,
  }, d.documentId, d.page);
  for (const o of context.observations) add("observation", o.test, o.date, {
    value: o.value, unit: o.unit, referenceLow: o.referenceLow, referenceHigh: o.referenceHigh,
    interpretation: o.interpretation, category: o.category, study: o.study, originalName: o.originalName, device: o.device, confidence: o.confidence,
  }, o.documentId, o.page);
  for (const m of context.medications ?? []) add("medication", m.name, m.date, {
    dose: m.dose, frequency: m.frequency, event: m.event, start: m.start, end: m.end,
  }, m.documentId);
  for (const s of context.documentSnippets ?? []) add("snippet", s.document, s.date, {
    excerpt: s.snippet, verification: "Extracted source text; may contain unconfirmed transcription. Verify against confirmed findings.",
  }, s.documentId ?? null, s.page ?? null);
  return all;
}

export function comparisonCaveat(points: Evidence[]): string | null {
  if (points.length < 2) return null;
  if (new Set(points.map((p) => p.label)).size > 1) return "Different measurements; no shared trend or delta.";
  if (new Set(points.map((p) => p.data.unit ?? null)).size > 1) return "Units differ; values cannot be compared directly.";
  if (new Set(points.map((p) => p.data.originalName ?? null)).size > 1 && points.some((p) => /pre|post|predicted|tissue|region/i.test(String(p.data.originalName ?? "")))) return "Measurement qualifiers differ or are missing; verify the original protocol before comparing.";
  if (points.some((p) => !p.date)) return "Measurement dates are missing.";
  if (new Set(points.map((p) => p.date)).size !== points.length) return "Same-day readings may use different protocols; no longitudinal trend inferred.";
  const devices = new Set(points.map((p) => p.data.device ?? null));
  if (devices.size > 1) return "Device information differs or is missing; direct comparability is unconfirmed.";
  const studies = new Set(points.map((p) => p.data.study ?? null));
  if (studies.size > 1) return "Study methods differ or are missing; direct comparability is unconfirmed.";
  if (/dexa|body composition|lean mass|fat mass|body fat|visceral|VAT\b|BMD|T.score/i.test(points.map((p) => `${p.label} ${p.data.study ?? ""}`).join(" ")) &&
      new Set(points.map((p) => p.documentId ?? p.id)).size > 1 && !points.every((p) => p.data.device)) {
    return "Cross-report body-composition measurements: matching scanner and protocol are unverified. Do not infer precise fat or muscle loss.";
  }
  return null;
}

export function packEvidence(context: AiContext, question: string, history: HistoryTurn[] = [], maxChars = 48000, now = new Date()) {
  const resolvedQuestion = retrievalQuestion(question, history);
  const ownScope = resolveDateScope(question, now);
  const scope = ownScope.from ? ownScope : resolveDateScope(resolvedQuestion, now);
  const all = collectEvidence(context);
  const inScope = (e: Evidence) => !e.date || ((!scope.from || e.date >= scope.from) && e.date <= scope.to);
  const eligible = all.filter(inScope);
  const baselineIds = new Set<string>();
  if (scope.from) {
    const oldest = new Date(`${scope.from}T00:00:00Z`);
    oldest.setUTCFullYear(oldest.getUTCFullYear() - 2);
    const datesByMetric = new Map<string, Set<string>>();
    for (const e of eligible.filter((e) => e.kind === "observation" && e.date)) {
      const key = e.label;
      const dates = datesByMetric.get(key) ?? new Set<string>();
      dates.add(e.date!); datesByMetric.set(key, dates);
    }
    // Prefer comparisons within the requested period. Earlier readings are
    // useful only when the period itself has fewer than two measurement dates.
    const currentMetrics = new Set([...datesByMetric].filter(([, dates]) => dates.size < 2).map(([key]) => key));
    const baselineByMetric = new Map<string, Evidence>();
    for (const e of all) {
      const key = e.label;
      if (e.kind !== "observation" || !currentMetrics.has(key) || !e.date || e.date >= scope.from || e.date < oldest.toISOString().slice(0, 10)) continue;
      if ((baselineByMetric.get(key)?.date ?? "") < e.date) baselineByMetric.set(key, e);
    }
    for (const e of baselineByMetric.values()) { eligible.push(e); baselineIds.add(e.id); }
  }
  const keywords = [...new Set(resolvedQuestion.toLowerCase().match(/[a-z]{3,}/g) ?? [])]
    .filter((w) => !/^(the|what|how|has|have|are|was|were|health|report|reports|results|last|months|year|and|with|this|that|from|changed|improved)$/.test(w));
  if (/muscle|dexa|dxa|body composition/i.test(question)) keywords.push("lean", "dexa", "dxa", "body composition", "scanner", "prodigy");
  const score = (e: Evidence) => {
    const text = `${e.label} ${JSON.stringify(e.data)}`.toLowerCase();
    const matched = keywords.filter((w) => text.includes(w)).length;
    return matched * 8 + (e.kind === "report" ? 6 : e.kind === "diagnosis" ? 5 : e.kind === "medication" ? 2 : 0);
  };
  // Round-robin endpoints across metrics prevent a dense series from crowding
  // out single readings. Reports and diagnoses participate in broad reviews.
  const groups = new Map<string, Evidence[]>();
  for (const e of eligible.filter((e) => e.kind === "observation")) {
    const key = e.label;
    const group = groups.get(key) ?? [];
    group.push(e);
    groups.set(key, group);
  }
  const endpoints = new Set<string>();
  for (const series of groups.values()) {
    series.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
    endpoints.add(series[0].id); endpoints.add(series.at(-1)!.id);
  }
  const ranked = [...eligible].sort((a, b) =>
    (score(b) + (endpoints.has(b.id) ? 3 : 0)) - (score(a) + (endpoints.has(a.id) ? 3 : 0)) ||
    (b.date ?? "").localeCompare(a.date ?? ""));
  // Only compact IDs reach the model; actual document IDs stay server-side.
  const documentIds = [...new Set(all.map((e) => e.documentId).filter(Boolean))];
  const wire = (e: Evidence) => ({ id: e.id, kind: e.kind, label: e.label, date: e.date,
    source: e.documentId ? `D${documentIds.indexOf(e.documentId) + 1}` : null,
    ...(baselineIds.has(e.id) ? { role: "Prior baseline outside requested period" } : {}), ...e.data });
  const selected: Evidence[] = [];
  const selectedIds = new Set<string>();
  let size = 0;
  for (const e of ranked) {
    const group = e.kind === "observation" && endpoints.has(e.id) ? groups.get(e.label) : undefined;
    // Reserve both endpoints together. Sorting all latest endpoints ahead of
    // older ones otherwise produces snapshots with no usable comparisons.
    const candidates = [...new Map((group ? [group[0], group.at(-1)!] : [e]).map((item) => [item.id, item])).values()]
      .filter((item) => !selectedIds.has(item.id));
    const cost = candidates.reduce((total, item) => total + JSON.stringify(item.kind === "observation" ? observationRow(wire(item)) : wire(item)).length, 0);
    if (size + cost > maxChars) continue;
    selected.push(...candidates); candidates.forEach((item) => selectedIds.add(item.id)); size += cost;
  }
  const omitted = ranked.filter((e) => !selectedIds.has(e.id));
  // A bounded catalog allows a second read without resending the full chart.
  const catalog = omitted.slice(0, 400).map((e) => ({ id: e.id, kind: e.kind, label: e.label, date: e.date }));
  const genomics = scopeGenomics(resolvedQuestion, context).genomics;
  const notes: string[] = [];
  if (omitted.length) notes.push(`${omitted.length} in-scope evidence items not in the initial packet; read relevant catalog items before drawing conclusions.`);
  if (omitted.length > catalog.length) notes.push(`${omitted.length - catalog.length} omitted items also exceed the catalog limit; coverage is partial.`);
  if (all.length >= 100000) notes.push("The database retrieval limit may have been reached; coverage is partial.");
  const represented = new Set(all.filter((e) => e.kind !== "snippet").map((e) => e.documentId));
  const missingDocuments = (context.documents ?? []).filter((d) => (!d.date || ((!scope.from || d.date >= scope.from) && d.date <= scope.to)) && !represented.has(d.id));
  if (missingDocuments.length) notes.push(`${missingDocuments.length} uploaded documents have no evidence in this packet. Absence of a finding is not a negative result.`);
  const comparisons = [...groups.values()].filter((s) => s.length > 1).map((s) => {
    const first = s[0], last = s.at(-1)!;
    const caveat = comparisonCaveat(s);
    return compact({ test: first.label, from: first.id, to: last.id, caveat,
      delta: !caveat && typeof first.data.value === "number" && typeof last.data.value === "number" ? Number((last.data.value - first.data.value).toFixed(4)) : null,
    });
  }).filter((c) => selectedIds.has(c.from as string) && selectedIds.has(c.to as string));
  const supplemental = {
    patientReported: context.patientReported.slice(0, 15),
    // Wearables only when asked about lifestyle or for a broad health review.
    healthRollups: /health|overall|sleep|exercise|fitness|activity|steps|heart rate|HRV|wearable/i.test(resolvedQuestion) ? context.healthRollups.slice(-30) : [],
    healthEvents: context.healthEvents.slice(-15),
    genomics,
  };
  return { all, selected, wire, scope, packet: {
    asOf: now.toISOString().slice(0, 10), profile: context.profile, scope,
    evidence: selected.map(wire), comparisons, catalog,
    coverage: { available: all.length, inScope: eligible.length, priorBaselines: baselineIds.size, included: selected.length, omitted: omitted.length, notes,
      documentsWithoutEvidence: missingDocuments.slice(0, 30).map((d) => ({ name: d.name, date: d.date, status: d.status })) },
    ...supplemental,
  } };
}
