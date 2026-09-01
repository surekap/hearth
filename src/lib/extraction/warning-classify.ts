/**
 * Classification of extractor warnings and uncertain items.
 *
 * The extractor emits free text, but the text falls into a few stable shapes
 * that differ in what the user can actually do about them. Filing them all
 * under one "attention needed" heading is why the review screen reads as a wall
 * of unresolvable alarms. Pure logic, no DB access — see CODING_STANDARDS.md.
 */

export type WarningKind =
  /** A value exists on the page but was not captured. The record is missing data. */
  | "missing_value"
  /** A table was only partially transcribed. Re-extracting that page can recover it. */
  | "partial_table"
  /** The extractor had to choose between readings and picked one. */
  | "ambiguity"
  /** Provenance/transcription note. Honest reporting, not a problem to fix. */
  | "note";

export type ClassifiedWarning = {
  text: string;
  kind: WarningKind;
  /** Absolute source page, when the text names one. */
  page: number | null;
  /** Whether the user can do something that changes the stored record. */
  actionable: boolean;
};

const MISSING_VALUE = [
  /not clearly (printed|visible|legible)/i,
  /blank or unreadable/i,
  /unreadable result/i,
  /not assigned a numeric value/i,
  /no numeric value/i,
];

const PARTIAL_TABLE = [
  /not fully represented/i,
  /n\/a entries/i,
  /only clearly readable .* values were extracted/i,
  /contains additional .* values/i,
];

const AMBIGUITY = [
  /\bis ambiguous\b/i,
  /\bambiguous\b/i,
  /varies by age/i,
  /interpreted as/i,
  /preserved as printed/i,
  /transcribed as printed/i,
  /conflicting/i,
];

function matches(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

export function extractPageNumber(text: string): number | null {
  const match = /\bpage:?\s*(\d+)\b/i.exec(text);
  if (!match) return null;
  const page = Number.parseInt(match[1], 10);
  return Number.isFinite(page) && page > 0 ? page : null;
}

/**
 * Stable identifier for a warning, derived from its text.
 *
 * Warnings live in an immutable JSONB array with no ids, so this is what links
 * a warning to the observation that answered it. Resolution is therefore
 * derived from the fix actually existing — a warning cannot be marked resolved
 * without a real record having been written. FNV-1a; collision risk across the
 * handful of warnings on one job is negligible.
 */
export function warningKey(text: string): string {
  const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();
  let hash = 0x811c9dc5;
  for (let i = 0; i < normalized.length; i += 1) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

export function classifyWarning(text: string): ClassifiedWarning {
  // Order matters. "values were not fully represented because of OCR/table
  // ambiguity" mentions ambiguity but is a partial table, so the more specific
  // shapes are tested first.
  let kind: WarningKind = "note";
  if (matches(text, MISSING_VALUE)) kind = "missing_value";
  else if (matches(text, PARTIAL_TABLE)) kind = "partial_table";
  else if (matches(text, AMBIGUITY)) kind = "ambiguity";

  return {
    text,
    kind,
    page: extractPageNumber(text),
    // Only missing_value changes what is stored; the rest are informational
    // until the re-extraction and disambiguation flows exist.
    actionable: kind === "missing_value",
  };
}

/**
 * Finds the extracted rows an ambiguity warning is talking about, by looking for
 * their printed names in the warning text.
 *
 * An ambiguity cannot be resolved by re-reading — the document really is
 * unclear — so the fix is the user correcting the affected row. This is what
 * connects the warning to the row worth correcting.
 *
 * Names shorter than three characters are skipped: tokens like "T4" or "K"
 * appear inside unrelated words and would mislabel the wrong row.
 */
export function rowsNamedInWarning<T extends { id: string; name: string | null }>(
  text: string,
  rows: T[]
): T[] {
  const haystack = text.toLowerCase();
  const matched: T[] = [];
  for (const row of rows) {
    const name = row.name?.trim().toLowerCase();
    if (!name || name.length < 3) continue;
    // Word-ish boundaries so "ALT" does not match inside "salt".
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(haystack)) {
      matched.push(row);
    }
  }
  return matched;
}

export function classifyWarnings(texts: string[]): ClassifiedWarning[] {
  return texts.map(classifyWarning);
}

/** Splits classified entries into the ones worth acting on and the rest. */
export function partitionWarnings(entries: ClassifiedWarning[]) {
  return {
    attention: entries.filter((entry) => entry.kind !== "note"),
    notes: entries.filter((entry) => entry.kind === "note"),
  };
}
