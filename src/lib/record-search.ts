export const MIN_SEARCH_LENGTH = 3;
export const MAX_SEARCH_LENGTH = 500;
export const SEARCH_DEBOUNCE_MS = 350;
export const SEARCH_CACHE_MS = 30_000;

export type SearchPlan = {
  concepts: string[][];
  exclude: string[];
  from: string | null;
  to: string | null;
  order: "oldest" | "newest";
};
export type SearchRecord = {
  id: string;
  title: string;
  date: string | null;
  dateIsFallback: boolean;
  kind: string;
  href: string;
  scanHref?: string;
};
export type IndexedRecord = SearchRecord & { text: string };
export type SearchResponse = {
  results: SearchRecord[];
  total: number;
  mode: "interpreted" | "keywords";
  order: "oldest" | "newest";
};
export function normalizeQuery(text: string) {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}
function words(text: string) {
  return text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
function contains(text: string, term: string) {
  const needle = words(term);
  return needle.length > 0 && ` ${text} `.includes(` ${needle}`);
}
export function keywordPlan(query: string): SearchPlan {
  return { concepts: words(query).split(" ").filter(Boolean).map(word => [word]), exclude: [], from: null, to: null, order: "newest" };
}
export function searchRecords(records: IndexedRecord[], plan: SearchPlan): SearchRecord[] {
  return records.filter(record => {
    if ((plan.from || plan.to) && !record.date) return false;
    if (record.date && ((plan.from && record.date < plan.from) || (plan.to && record.date > plan.to))) return false;
    const text = words(`${record.title} ${record.kind} ${record.text}`);
    return plan.concepts.every(terms => terms.some(term => contains(text, term))) && !plan.exclude.some(term => contains(text, term));
  }).sort((a, b) => {
    if (!a.date) return b.date ? 1 : a.id.localeCompare(b.id);
    if (!b.date) return -1;
    return (plan.order === "oldest" ? 1 : -1) * a.date.localeCompare(b.date) || a.id.localeCompare(b.id);
  }).map(record => ({ id: record.id, title: record.title, date: record.date, dateIsFallback: record.dateIsFallback, kind: record.kind, href: record.href, ...(record.scanHref ? { scanHref: record.scanHref } : {}) }));
}

/** Bounded, memory-only cache. Rejected requests are never cached. */
export class SearchCache<T> {
  private entries = new Map<string, { expires: number; value: Promise<T> }>();
  constructor(private maxEntries: number, private ttl: number) {}
  get(key: string, load: () => Promise<T>): Promise<T> {
    const cached = this.entries.get(key);
    if (cached && cached.expires > Date.now()) return cached.value;
    this.entries.delete(key);
    while (this.entries.size >= this.maxEntries) this.entries.delete(this.entries.keys().next().value!);
    const entry = { expires: Date.now() + this.ttl, value: Promise.resolve().then(load) };
    this.entries.set(key, entry);
    void entry.value.catch(() => { if (this.entries.get(key) === entry) this.entries.delete(key); });
    return entry.value;
  }
}
