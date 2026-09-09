import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { redactPII } from "./redact";
import { resolveDateScope } from "./evidence";
import type { AiContext } from "./context";

/** Page-aware source excerpts supplement confirmed facts; they are never
 * labelled confirmed merely because their upload belongs to the profile. */
export function rankSourceSections(rawText: string, question: string) {
  const keywords = [...new Set(question.toLowerCase().match(/[a-z]{3,}/g) ?? [])]
    .filter((w) => !/^(the|what|how|are|was|were|has|have|with|from|for|and|report|reports|results|last|months|year)$/.test(w));
  if (/dexa|body|weight|fat|muscle|metabolic/i.test(question)) keywords.push("dexa", "lunar", "osteosys", "scanner", "prodigy", "body composition");
  const pages = rawText.split(/\[Page\s+(\d+)\]/i);
  const sections: Array<{ snippet: string; page: number | null; score: number }> = [];
  for (let i = 0; i < pages.length; i += i === 0 ? 1 : 2) {
    const page = i === 0 ? null : Number(pages[i]);
    const text = i === 0 ? pages[0] : pages[i + 1] ?? "";
    // Overlapping bounded excerpts cover later keyword matches too.
    for (let start = 0; start < text.length; start += 1400) {
      const snippet = text.slice(start, start + 1800).trim();
      const lower = snippet.toLowerCase();
      const score = keywords.filter((k) => lower.includes(k)).length;
      if (score) sections.push({ snippet, page, score });
    }
  }
  return sections.sort((a, b) => b.score - a.score);
}

export async function findDocumentSnippets(profileId: string, question: string, knownNames: string[], maxSnippets = 8): Promise<NonNullable<AiContext["documentSnippets"]>> {
  const scope = resolveDateScope(question);
  const docs = await db.query.documents.findMany({
    where: eq(schema.documents.profileId, profileId),
    columns: { id: true, originalFilename: true, documentDate: true },
  });
  const relevant = docs.filter((d) => !d.documentDate || ((!scope.from || d.documentDate >= scope.from) && d.documentDate <= scope.to));
  if (!relevant.length) return [];
  const texts = await db.query.documentText.findMany({
    where: inArray(schema.documentText.documentId, relevant.map((d) => d.id)),
    columns: { documentId: true, rawText: true },
  });
  const byId = new Map(docs.map((d) => [d.id, d]));
  // One strongest section per document first so one long report cannot crowd
  // out every other study. Full confirmed study findings are supplied separately.
  return texts.flatMap((t) => {
    const doc = byId.get(t.documentId)!;
    const best = rankSourceSections(t.rawText, question)[0];
    return best ? [{ documentId: doc.id, document: redactPII(doc.originalFilename, knownNames), date: doc.documentDate,
      snippet: redactPII(best.snippet, knownNames), page: best.page, score: best.score }] : [];
  }).sort((a, b) => b.score - a.score || (b.date ?? "").localeCompare(a.date ?? ""))
    .slice(0, maxSnippets).map(({ documentId, document, date, snippet, page }) => ({ documentId, document, date, snippet, page }));
}
