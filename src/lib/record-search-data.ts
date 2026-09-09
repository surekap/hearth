import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

/** Build only the active profile's search corpus; raw text stays on the server. */
export async function getRecordSearchText(profileId: string) {
  const [documents, texts, reports] = await Promise.all([
    db.query.documents.findMany({ where: eq(schema.documents.profileId, profileId) }),
    db.select({ documentId: schema.documentText.documentId, text: schema.documentText.rawText })
      .from(schema.documentText).innerJoin(schema.documents, eq(schema.documentText.documentId, schema.documents.id))
      .where(eq(schema.documents.profileId, profileId)),
    db.query.clinicalReports.findMany({ where: eq(schema.clinicalReports.profileId, profileId) }),
  ]);
  const result = new Map<string, string>();
  const append = (id: string, text: string) => result.set(id, `${result.get(id) ?? ""} ${text}`);
  for (const d of documents) append(d.id, `${d.originalFilename} ${d.documentType} ${d.source}`);
  for (const t of texts) append(t.documentId, t.text);
  for (const r of reports) append(r.documentId, [r.studyName, r.specialty, r.bodyPart, r.modality, r.facility, r.doctorName, r.summary, r.impression, JSON.stringify(r.findingsJson)].filter(Boolean).join(" "));
  return result;
}
