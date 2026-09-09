import { and, eq, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { SearchCache, SEARCH_CACHE_MS, type IndexedRecord } from "./record-search";

const corpus = new SearchCache<IndexedRecord[]>(8, SEARCH_CACHE_MS);

/** Authorization happens before every call, including cache hits. Raw text stays on the server. */
export function getSearchRecords(profileId: string): Promise<IndexedRecord[]> {
  return corpus.get(profileId, async () => {
    const [documents, texts, reports, scans, diagnoses, genetics, observations, medications] = await Promise.all([
      db.query.documents.findMany({ where: eq(schema.documents.profileId, profileId) }),
      db.select({ documentId: schema.documentText.documentId, text: schema.documentText.rawText })
        .from(schema.documentText).innerJoin(schema.documents, eq(schema.documentText.documentId, schema.documents.id))
        .where(eq(schema.documents.profileId, profileId)),
      db.query.clinicalReports.findMany({ where: eq(schema.clinicalReports.profileId, profileId) }),
      db.query.clinicalImages.findMany({ where: and(eq(schema.clinicalImages.profileId, profileId), eq(schema.clinicalImages.status, "accepted")) }),
      db.query.diagnoses.findMany({ where: eq(schema.diagnoses.profileId, profileId) }),
      db.query.geneticReports.findMany({ where: eq(schema.geneticReports.profileId, profileId) }),
      db.select({ id: schema.observations.id, documentId: schema.observations.documentId, date: schema.observations.observedAt, value: schema.observations.valueNumeric, valueText: schema.observations.valueText, unit: schema.observations.unit, name: schema.observationTypes.canonicalName, aliases: schema.observationTypes.aliases, typeId: schema.observationTypes.id })
        .from(schema.observations).innerJoin(schema.observationTypes, eq(schema.observations.observationTypeId, schema.observationTypes.id))
        .where(and(eq(schema.observations.profileId, profileId), eq(schema.observations.status, "confirmed"), ne(schema.observations.source, "apple_health"))),
      db.query.medicationEvents.findMany({ where: eq(schema.medicationEvents.profileId, profileId) }),
    ]);
    const byDocument = new Map<string, IndexedRecord>(documents.map(d => [d.id, {
      id: d.id, title: d.originalFilename, date: d.documentDate ?? d.uploadedAt.toISOString().slice(0, 10), dateIsFallback: !d.documentDate,
      kind: d.documentType.replaceAll("_", " "), href: `/documents/${d.id}/review`, text: `${d.source} ${d.originalFilename}`,
    }]));
    const append = (id: string | null, text: string) => { const row = id ? byDocument.get(id) : null; if (row) row.text += ` ${text}`; };
    for (const t of texts) append(t.documentId, t.text);
    for (const r of reports) {
      append(r.documentId, [r.studyName, r.specialty, r.bodyPart, r.modality, r.facility, r.doctorName, r.summary, r.impression, JSON.stringify(r.findingsJson)].filter(Boolean).join(" "));
      const row = byDocument.get(r.documentId);
      if (row && r.reportDate && row.dateIsFallback) { row.date = r.reportDate; row.dateIsFallback = false; }
    }
    for (const scan of scans) {
      append(scan.documentId, [scan.studyName, scan.bodyPart, scan.modality, scan.pageLabel, scan.laterality, scan.assetKind, "scan image"].filter(Boolean).join(" "));
      const row = byDocument.get(scan.documentId);
      if (row) { row.scanHref ??= `/api/clinical-images/${scan.id}/file`; }
    }
    for (const d of diagnoses) append(d.documentId, [d.conditionName, d.normalizedName, d.bodySite, d.doctorName, d.note].filter(Boolean).join(" "));
    for (const g of genetics) append(g.documentId, [g.reportName, g.vendor, g.testKind, g.summary].filter(Boolean).join(" "));
    const standalone: IndexedRecord[] = [];
    for (const o of observations) {
      const text = [o.name, ...o.aliases, o.value, o.valueText, o.unit].filter(v => v != null).join(" ");
      if (o.documentId) append(o.documentId, text);
      else standalone.push({ id: o.id, title: o.name, date: o.date.toISOString().slice(0, 10), dateIsFallback: false, kind: "measurement", href: `/metrics/${o.typeId}`, text });
    }
    for (const m of medications) {
      append(m.documentId, [m.nameText, m.dose, m.frequency].filter(Boolean).join(" "));
      if (!m.documentId && ["prescribed", "started", "stopped", "dose_changed"].includes(m.eventType)) standalone.push({ id: m.id, title: `${m.nameText} ${m.eventType.replaceAll("_", " ")}`, date: m.eventTime.toISOString().slice(0, 10), dateIsFallback: false, kind: "medication", href: "/meds", text: [m.nameText, m.dose, m.frequency].filter(Boolean).join(" ") });
    }
    return [...byDocument.values(), ...standalone];
  });
}
