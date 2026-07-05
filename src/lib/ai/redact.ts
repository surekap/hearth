export const REDACTION_VERSION = "v1";

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
// Indian mobile / landline shapes; deliberately conservative.
const PHONE_RE = /(\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/g;
const AADHAAR_RE = /\b\d{4}\s?\d{4}\s?\d{4}\b/g;

/**
 * PII redaction v1 applied to every string sent to the LLM.
 * Strips emails, phone numbers, Aadhaar-like numbers, and the known names
 * of the user and family members.
 */
export function redactPII(text: string, knownNames: string[]): string {
  let out = text
    .replace(EMAIL_RE, "[EMAIL]")
    .replace(AADHAAR_RE, "[ID]")
    .replace(PHONE_RE, "[PHONE]");
  for (const name of knownNames) {
    if (!name || name.length < 2) continue;
    const re = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    out = out.replace(re, "[NAME]");
  }
  return out;
}

export function redactDeep<T>(value: T, knownNames: string[]): T {
  if (typeof value === "string") return redactPII(value, knownNames) as T;
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, knownNames)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        redactDeep(v, knownNames),
      ])
    ) as T;
  }
  return value;
}
