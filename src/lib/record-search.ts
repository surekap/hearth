export type SearchParams = Record<string, string | string[] | undefined>;
export type RecordFilters = { q: string; specialty: string; from: string; to: string; sort: string };
const specialties: Record<string, string[]> = {
  dental: ["dental", "dentist", "dentistry", "tooth", "teeth", "periodontal", "orthodontic", "endodontic", "maxillofacial", "odontogram"],
  eye: ["eye", "eyes", "ophthalmology", "ophthalmic", "ophthalmologist", "optometry", "optometrist", "retina", "retinal", "cornea", "corneal", "glaucoma", "cataract", "ocular", "fundus", "visual acuity"],
};
export function parseRecordFilters(params: SearchParams): RecordFilters {
  const value = (key: string) => typeof params[key] === "string" ? params[key].trim() : "";
  const date = (key: string) => {
    const input = value(key);
    return /^\d{4}-\d{2}-\d{2}$/.test(input) && !Number.isNaN(Date.parse(input)) && new Date(input).toISOString().slice(0, 10) === input ? input : "";
  };
  return { q: value("q"), specialty: Object.hasOwn(specialties, value("specialty")) ? value("specialty") : "", from: date("from"), to: date("to"), sort: value("sort") === "oldest" ? "oldest" : "newest" };
}
function normalize(text: string) { return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim(); }
function hasTerm(text: string, term: string) { return ` ${text} `.includes(` ${term} `); }
export function matchesRecord(text: string, date: string | null, filters: RecordFilters) {
  if ((filters.from || filters.to) && !date) return false;
  if (date && ((filters.from && date < filters.from) || (filters.to && date > filters.to))) return false;
  const normalized = normalize(text);
  if (filters.specialty && !specialties[filters.specialty].some(term => hasTerm(normalized, term))) return false;
  return normalize(filters.q).split(" ").filter(Boolean).every(term => {
    const aliases = Object.hasOwn(specialties, term) ? specialties[term] : undefined;
    return aliases ? aliases.some(alias => hasTerm(normalized, alias)) : normalized.includes(term);
  });
}
export function compareRecordDates(a: string | null, b: string | null, sort: string) {
  if (!a) return b ? 1 : 0;
  if (!b) return -1;
  return (sort === "oldest" ? 1 : -1) * a.localeCompare(b);
}
export function recordSearchHref(path: string, filters: RecordFilters) {
  const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
  return `${path}?${params}`;
}
