import { db, schema } from "@/db";

export type ObservationTypeRow = typeof schema.observationTypes.$inferSelect;

function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Builds a lookup from normalized canonical names + aliases to observation
 * types, so "SGPT", "sgpt (alt)" and "ALT" all resolve to the same type.
 */
export async function buildCanonicalMap(): Promise<Map<string, ObservationTypeRow>> {
  const types = await db.select().from(schema.observationTypes);
  const map = new Map<string, ObservationTypeRow>();
  for (const t of types) {
    map.set(normalize(t.canonicalName), t);
    for (const alias of t.aliases) map.set(normalize(alias), t);
  }
  return map;
}

export function resolveObservationType(
  map: Map<string, ObservationTypeRow>,
  candidates: (string | null | undefined)[]
): ObservationTypeRow | null {
  for (const c of candidates) {
    if (!c) continue;
    const hit = map.get(normalize(c));
    if (hit) return hit;
  }
  return null;
}

export function computeInterpretation(
  value: number | null,
  low: number | null,
  high: number | null,
  fromModel: "low" | "normal" | "high" | "critical" | "unknown"
): "low" | "normal" | "high" | "critical" | "unknown" {
  if (value != null && (low != null || high != null)) {
    if (high != null && value > high) return value > high * 2 ? "critical" : "high";
    if (low != null && value < low) return "low";
    return "normal";
  }
  return fromModel;
}
