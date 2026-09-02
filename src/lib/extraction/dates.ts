/**
 * Locale evidence for numeric dates.
 *
 * A printed "01/09/2026" is 1 September in almost every country and 9 January
 * in the United States. The document itself is the best evidence, but when it
 * offers none the lab's location settles the question — a report from Chennai
 * is not using US month-first dates. Pure logic, no DB access.
 */

export type DateConvention = "day_first" | "month_first";

/** Countries whose everyday numeric dates put the month first. */
const MONTH_FIRST_COUNTRIES = new Set(["US", "PH", "FM", "MH", "PW"]);

/**
 * Countries where numeric dates are written both ways in practice, so the
 * country alone proves nothing. Canada is the main one.
 */
const MIXED_COUNTRIES = new Set(["CA"]);

export function normalizeCountryCode(value: string | null | undefined): string | null {
  if (!value) return null;
  const code = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

export function dateConventionForCountry(
  country: string | null | undefined
): DateConvention | null {
  const code = normalizeCountryCode(country);
  if (!code || MIXED_COUNTRIES.has(code)) return null;
  return MONTH_FIRST_COUNTRIES.has(code) ? "month_first" : "day_first";
}

export function countryDisplayName(country: string | null | undefined): string | null {
  const code = normalizeCountryCode(country);
  if (!code) return null;
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/**
 * Whether an extractor note is about not knowing the day/month order. These
 * notes are superseded once the order has been resolved from evidence.
 */
export function isDateFormatUncertainty(text: string): boolean {
  if (!/\bdates?\b/i.test(text)) return false;
  return /\b(format|ambiguous|ambiguity|dd\s*\/\s*mm|mm\s*\/\s*dd|day[\s/-]*month|month[\s/-]*day|day-first|month-first|locale)\b/i.test(
    text
  );
}

/**
 * The earliest dated thing in an extraction. A bundle of several reports has
 * no single report_date, but it still has a date that belongs on the
 * document instead of "unknown".
 */
export function earliestExtractedDate(result: {
  report_date: string | null;
  observations: Array<{ report_date: string | null }>;
  reports: Array<{ report_date: string | null }>;
}): string | null {
  const candidates = [
    result.report_date,
    ...result.observations.map((o) => o.report_date),
    ...result.reports.map((r) => r.report_date),
  ].filter((d): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d));
  if (candidates.length === 0) return null;
  return candidates.sort()[0];
}
