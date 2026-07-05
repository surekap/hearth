import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { db, schema } from "@/db";

export const DASHBOARD_METRICS = [
  "Weight",
  "ALT",
  "AST",
  "GGT",
  "Triglycerides",
  "HDL",
  "LDL",
  "HbA1c",
  "Fasting Glucose",
  "CRP",
  "Vitamin D",
  "Uric Acid",
] as const;

export type DashboardRange = "3m" | "6m" | "1y" | "3y" | "all";

export function rangeStart(range: DashboardRange): Date | null {
  if (range === "all") return null;
  const months = { "3m": 3, "6m": 6, "1y": 12, "3y": 36 }[range];
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d;
}

export type MetricPoint = {
  date: string; // ISO
  value: number;
  referenceLow: number | null;
  referenceHigh: number | null;
  interpretation: string;
};

export type MetricCard = {
  name: string;
  category: string;
  unit: string | null;
  points: MetricPoint[];
  latest: MetricPoint | null;
  trend: "rising" | "falling" | "flat" | null;
};

export type DashboardMarker = {
  date: string;
  label: string;
  kind: "report" | "prescription" | "document" | "medication";
};

function trendOf(points: MetricPoint[]): "rising" | "falling" | "flat" | null {
  if (points.length < 2) return null;
  const first = points[0].value;
  const last = points[points.length - 1].value;
  if (first === 0) return null;
  const change = (last - first) / Math.abs(first);
  if (change > 0.05) return "rising";
  if (change < -0.05) return "falling";
  return "flat";
}

export async function getMetabolicLiverData(profileId: string, range: DashboardRange) {
  const start = rangeStart(range);

  const types = await db.query.observationTypes.findMany({
    where: inArray(schema.observationTypes.canonicalName, [...DASHBOARD_METRICS]),
  });
  const typeIds = types.map((t) => t.id);

  const conditions = [
    eq(schema.observations.profileId, profileId),
    eq(schema.observations.status, "confirmed"),
    inArray(schema.observations.observationTypeId, typeIds),
  ];
  if (start) conditions.push(gte(schema.observations.observedAt, start));

  const rows = await db.query.observations.findMany({
    where: and(...conditions),
    orderBy: [asc(schema.observations.observedAt)],
  });

  const byType = new Map<string, MetricPoint[]>();
  for (const r of rows) {
    if (r.valueNumeric == null) continue;
    const list = byType.get(r.observationTypeId) ?? [];
    list.push({
      date: r.observedAt.toISOString(),
      value: r.valueNumeric,
      referenceLow: r.referenceLow,
      referenceHigh: r.referenceHigh,
      interpretation: r.interpretation,
    });
    byType.set(r.observationTypeId, list);
  }

  const cards: MetricCard[] = DASHBOARD_METRICS.map((name) => {
    const type = types.find((t) => t.canonicalName === name);
    const points = type ? (byType.get(type.id) ?? []) : [];
    return {
      name,
      category: type?.category ?? "other",
      unit: points[points.length - 1]
        ? (rows.find(
            (r) =>
              r.observationTypeId === type?.id &&
              r.observedAt.toISOString() === points[points.length - 1].date
          )?.unit ?? type?.normalUnit ?? null)
        : (type?.normalUnit ?? null),
      points,
      latest: points[points.length - 1] ?? null,
      trend: trendOf(points),
    };
  });

  // Derived signals from latest values
  const latestOf = (name: string) =>
    cards.find((c) => c.name === name)?.latest?.value ?? null;
  const alt = latestOf("ALT");
  const ast = latestOf("AST");
  const tg = latestOf("Triglycerides");
  const hdl = latestOf("HDL");

  const derived = {
    astAltRatio: alt && ast ? Number((ast / alt).toFixed(2)) : null,
    tgHdlRatio: tg && hdl ? Number((tg / hdl).toFixed(2)) : null,
    altTrend: cards.find((c) => c.name === "ALT")?.trend ?? null,
    hba1cTrend: cards.find((c) => c.name === "HbA1c")?.trend ?? null,
    abnormalCount: rows.filter(
      (r) => r.interpretation === "high" || r.interpretation === "low" || r.interpretation === "critical"
    ).length,
    totalCount: rows.length,
  };

  // Timeline markers: clinical reports + prescriptions/imaging documents
  const markerConditions = [eq(schema.documents.profileId, profileId)];
  const docs = await db.query.documents.findMany({
    where: and(...markerConditions),
    orderBy: [asc(schema.documents.uploadedAt)],
  });
  const markers: DashboardMarker[] = docs
    .filter((d) => ["prescription", "imaging", "specialist_report", "discharge_summary"].includes(d.documentType))
    .map((d) => ({
      date: (d.documentDate ? new Date(d.documentDate) : d.uploadedAt).toISOString(),
      label:
        d.documentType === "prescription"
          ? "Prescription"
          : d.documentType === "imaging"
            ? "Imaging"
            : "Specialist report",
      kind: d.documentType === "prescription" ? ("prescription" as const) : ("report" as const),
    }));

  // Medication started/stopped markers (spec §12 timeline overlays)
  const medEvents = await db.query.medicationEvents.findMany({
    where: eq(schema.medicationEvents.profileId, profileId),
    orderBy: [asc(schema.medicationEvents.eventTime)],
  });
  for (const m of medEvents) {
    if (m.eventType === "started" || m.eventType === "stopped" || m.eventType === "prescribed") {
      markers.push({
        date: m.eventTime.toISOString(),
        label: `${m.nameText} ${m.eventType}`,
        kind: "medication",
      });
    }
  }

  const filteredMarkers = markers
    .filter((m) => !start || new Date(m.date) >= start)
    .sort((a, b) => a.date.localeCompare(b.date));

  return { range, cards, derived, markers: filteredMarkers };
}
