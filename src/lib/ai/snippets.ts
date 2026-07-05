import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { redactPII } from "./redact";

const STOPWORDS = new Set(
  "the a an is are was were my me i you your has have had how what when why which does did do can could should over last past three years months weeks days value values test tests result results report reports level levels".split(" ")
);

/**
 * Raw-text fallback: when a question uses terms that don't map to any
 * structured observation (lab comments, methodology notes, report prose),
 * pull short keyword-matched snippets from the profile's OCR text so the
 * model can see the original wording — without shipping whole documents.
 */
export async function findDocumentSnippets(
  profileId: string,
  question: string,
  knownNames: string[],
  maxSnippets = 2
): Promise<Array<{ document: string; date: string | null; snippet: string }>> {
  const keywords = [
    ...new Set(
      question
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 4 && !STOPWORDS.has(w))
    ),
  ];
  if (keywords.length === 0) return [];

  const docs = await db.query.documents.findMany({
    where: eq(schema.documents.profileId, profileId),
    columns: { id: true, originalFilename: true, documentDate: true },
  });
  if (docs.length === 0) return [];
  const docById = new Map(docs.map((d) => [d.id, d]));

  const texts = await db.query.documentText.findMany({
    where: inArray(
      schema.documentText.documentId,
      docs.map((d) => d.id)
    ),
    columns: { documentId: true, rawText: true },
  });

  const snippets: Array<{ document: string; date: string | null; snippet: string; score: number }> = [];
  for (const t of texts) {
    const lower = t.rawText.toLowerCase();
    let bestIdx = -1;
    let bestScore = 0;
    for (const kw of keywords) {
      const idx = lower.indexOf(kw);
      if (idx === -1) continue;
      // score = how many keywords land within the same window
      const windowText = lower.slice(Math.max(0, idx - 250), idx + 250);
      const score = keywords.filter((k) => windowText.includes(k)).length;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = idx;
      }
    }
    if (bestIdx >= 0) {
      const doc = docById.get(t.documentId);
      const raw = t.rawText.slice(Math.max(0, bestIdx - 250), bestIdx + 250).trim();
      snippets.push({
        document: doc?.originalFilename ?? "document",
        date: doc?.documentDate ?? null,
        snippet: redactPII(raw, knownNames),
        score: bestScore,
      });
    }
  }

  return snippets
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSnippets)
    .map(({ document, date, snippet }) => ({ document, date, snippet }));
}
