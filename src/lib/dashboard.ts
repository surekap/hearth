import { and, asc, desc, eq, gte } from "drizzle-orm";
import { db, schema } from "@/db";

export const METABOLIC_CORE_METRICS = [
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

const METABOLIC_CATEGORIES = new Set([
  "body",
  "liver",
  "lipid",
  "glucose",
  "inflammation",
  "vitamin",
  "renal",
]);

const CATEGORY_LABELS: Record<string, string> = {
  activity: "Activity",
  allergy: "Allergies",
  autoimmune: "Autoimmune",
  body: "Body",
  cardiac: "Cardiac",
  cardiovascular: "Cardiovascular",
  coagulation: "Coagulation",
  environment: "Environment",
  event: "Events",
  glucose: "Glucose",
  hematology: "Blood counts",
  hormone: "Hormones",
  infectious: "Infectious disease",
  inflammation: "Inflammation",
  lipid: "Lipids",
  liver: "Liver",
  mineral: "Minerals",
  mobility: "Mobility",
  nutrition: "Nutrition",
  other: "Other",
  renal: "Kidney",
  respiratory: "Respiratory",
  sleep: "Sleep",
  thyroid: "Thyroid",
  tumor_marker: "Cancer screening",
  urine: "Urine",
  vitamin: "Vitamins",
};

const CATEGORY_ORDER = [
  "liver",
  "lipid",
  "glucose",
  "body",
  "cardiovascular",
  "hematology",
  "renal",
  "thyroid",
  "inflammation",
  "vitamin",
  "tumor_marker",
  "urine",
  "activity",
  "sleep",
];

const MAX_CHART_POINTS_PER_METRIC = 80;

export type DashboardRange = "3m" | "6m" | "1y" | "3y" | "all";

export function rangeStart(range: DashboardRange): Date | null {
  if (range === "all") return null;
  const months = { "3m": 3, "6m": 6, "1y": 12, "3y": 36 }[range];
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d;
}

export type MetricPoint = {
  date: string;
  value: number;
  referenceLow: number | null;
  referenceHigh: number | null;
  interpretation: string;
};

export type MetricCard = {
  name: string;
  category: string;
  categoryLabel: string;
  unit: string | null;
  points: MetricPoint[];
  latest: MetricPoint | null;
  trend: "rising" | "falling" | "flat" | null;
  attention: boolean;
  reason: string | null;
};

export type DashboardSection = {
  id: string;
  title: string;
  description: string;
  cards: MetricCard[];
};

export type DashboardFocus = {
  label: string;
  value: string;
  detail: string;
  tone: "neutral" | "warning" | "danger" | "success";
};

export type DashboardReportGroup = {
  key: string;
  label: string;
  count: number;
  followUpCount: number;
  latestDate: string | null;
  latestSummary: string | null;
};

export type DashboardMarker = {
  date: string;
  label: string;
  kind: "report" | "prescription" | "document" | "medication";
};

export type AdaptiveDashboardData = {
  range: DashboardRange;
  focus: DashboardFocus[];
  sections: DashboardSection[];
  derived: {
    astAltRatio: number | null;
    tgHdlRatio: number | null;
    altTrend: string | null;
    hba1cTrend: string | null;
    abnormalCount: number;
    totalCount: number;
    activeCategoryCount: number;
    reportGroupCount: number;
    latestDate: string | null;
  };
  reportGroups: DashboardReportGroup[];
  markers: DashboardMarker[];
};

type ObservationRow = {
  observedAt: Date;
  valueNumeric: number | null;
  unit: string | null;
  referenceLow: number | null;
  referenceHigh: number | null;
  interpretation: string;
  observationTypeId: string;
  typeName: string;
  category: string;
  normalUnit: string | null;
};

function categoryLabel(category: string) {
  return CATEGORY_LABELS[category] ?? titleize(category);
}

function titleize(input: string) {
  return input
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

function isAbnormal(interpretation: string | null | undefined) {
  return interpretation === "high" || interpretation === "low" || interpretation === "critical";
}

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

function downsamplePoints(points: MetricPoint[], maxPoints = MAX_CHART_POINTS_PER_METRIC) {
  if (points.length <= maxPoints) return points;
  const step = Math.ceil(points.length / maxPoints);
  const sampled = points.filter((_, index) => index % step === 0);
  const latest = points[points.length - 1];
  if (sampled[sampled.length - 1]?.date !== latest.date) sampled.push(latest);
  return sampled;
}

function cardReason(card: MetricCard) {
  if (!card.latest) return null;
  if (card.latest.interpretation === "critical") return "critical";
  if (isAbnormal(card.latest.interpretation)) return card.latest.interpretation;
  if (card.trend === "rising") return "rising";
  if (card.trend === "falling") return "falling";
  return null;
}

function metricRank(card: MetricCard) {
  const coreIndex = METABOLIC_CORE_METRICS.indexOf(
    card.name as (typeof METABOLIC_CORE_METRICS)[number]
  );
  const categoryIndex = CATEGORY_ORDER.indexOf(card.category);
  const latest = card.latest;
  return [
    latest?.interpretation === "critical" ? 0 : 1,
    latest && isAbnormal(latest.interpretation) ? 0 : 1,
    coreIndex === -1 ? 1 : 0,
    coreIndex === -1 ? 999 : coreIndex,
    card.trend && card.trend !== "flat" ? 0 : 1,
    categoryIndex === -1 ? 999 : categoryIndex,
    card.name,
  ] as const;
}

function compareCards(a: MetricCard, b: MetricCard) {
  const ar = metricRank(a);
  const br = metricRank(b);
  for (let i = 0; i < ar.length; i++) {
    const av = ar[i];
    const bv = br[i];
    if (typeof av === "number" && typeof bv === "number" && av !== bv) return av - bv;
    if (typeof av === "string" && typeof bv === "string" && av !== bv) return av.localeCompare(bv);
  }
  return 0;
}

function buildCards(rows: ObservationRow[]): MetricCard[] {
  const byType = new Map<string, ObservationRow[]>();
  for (const r of rows) {
    if (r.valueNumeric == null) continue;
    const list = byType.get(r.observationTypeId) ?? [];
    list.push(r);
    byType.set(r.observationTypeId, list);
  }

  const cards = [...byType.values()].map((list) => {
    const latestRow = list[list.length - 1];
    const allPoints = list.map((r) => ({
      date: r.observedAt.toISOString(),
      value: r.valueNumeric!,
      referenceLow: r.referenceLow,
      referenceHigh: r.referenceHigh,
      interpretation: r.interpretation,
    }));
    const trend = trendOf(allPoints);
    const points = downsamplePoints(allPoints);
    const card: MetricCard = {
      name: latestRow.typeName,
      category: latestRow.category,
      categoryLabel: categoryLabel(latestRow.category),
      unit: latestRow.unit ?? latestRow.normalUnit,
      points,
      latest: allPoints[allPoints.length - 1] ?? null,
      trend,
      attention: false,
      reason: null,
    };
    card.reason = cardReason(card);
    card.attention = Boolean(
      card.latest &&
        (isAbnormal(card.latest.interpretation) ||
          card.latest.interpretation === "critical" ||
          (trend != null && trend !== "flat"))
    );
    return card;
  });

  return cards.sort(compareCards);
}

function buildSections(cards: MetricCard[]): DashboardSection[] {
  const sections: DashboardSection[] = [];
  const attention = cards.filter((c) => c.latest && c.attention).slice(0, 6);
  if (attention.length > 0) {
    sections.push({
      id: "attention",
      title: "Needs attention",
      description: "Abnormal latest values and meaningful trends from this profile.",
      cards: attention,
    });
  }

  const metabolic = cards.filter((c) => METABOLIC_CATEGORIES.has(c.category));
  if (metabolic.length > 0) {
    sections.push({
      id: "metabolic",
      title: "Metabolic, liver & kidney",
      description: "Only shown because this profile has relevant confirmed values.",
      cards: metabolic.slice(0, 12),
    });
  }

  const byCategory = new Map<string, MetricCard[]>();
  for (const card of cards) {
    if (METABOLIC_CATEGORIES.has(card.category)) continue;
    const list = byCategory.get(card.category) ?? [];
    list.push(card);
    byCategory.set(card.category, list);
  }

  const categorySections = [...byCategory.entries()]
    .sort(([a], [b]) => {
      const ai = CATEGORY_ORDER.indexOf(a);
      const bi = CATEGORY_ORDER.indexOf(b);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    })
    .slice(0, 5)
    .map(([category, categoryCards]) => ({
      id: category,
      title: categoryLabel(category),
      description: "Appears because confirmed data exists in this area.",
      cards: categoryCards.slice(0, 8),
    }));

  sections.push(...categorySections);
  return sections;
}

function buildFocus(input: {
  cards: MetricCard[];
  rows: ObservationRow[];
  reportGroups: DashboardReportGroup[];
}): DashboardFocus[] {
  const latestByName = new Map<string, MetricCard>();
  for (const c of input.cards) latestByName.set(c.name, c);
  const latest = input.cards.filter((c) => c.latest);
  const abnormalLatest = latest.filter((c) => c.latest && isAbnormal(c.latest.interpretation));
  const categories = new Set(latest.map((c) => c.category));
  const latestDate = latest
    .map((c) => c.latest?.date)
    .filter(Boolean)
    .sort()
    .at(-1);

  const out: DashboardFocus[] = [
    {
      label: "Needs attention",
      value: String(abnormalLatest.length),
      detail:
        abnormalLatest.length === 0
          ? "No latest confirmed values are flagged."
          : abnormalLatest
              .slice(0, 3)
              .map((c) => c.name)
              .join(", "),
      tone: abnormalLatest.length > 0 ? "danger" : "success",
    },
    {
      label: "Active areas",
      value: String(categories.size),
      detail:
        categories.size === 0
          ? "Upload confirmed data to build this view."
          : [...categories].slice(0, 4).map(categoryLabel).join(", "),
      tone: "neutral",
    },
    {
      label: "Care reports",
      value: String(input.reportGroups.length),
      detail:
        input.reportGroups.length === 0
          ? "No specialist reports in this range."
          : input.reportGroups
              .slice(0, 3)
              .map((g) => g.label)
              .join(", "),
      tone: input.reportGroups.some((g) => g.followUpCount > 0) ? "warning" : "neutral",
    },
    {
      label: "Latest update",
      value: latestDate
        ? new Date(latestDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
        : "–",
      detail: latestDate
        ? "Most recent confirmed value."
        : "No confirmed observations in this range.",
      tone: "neutral",
    },
  ];

  const alt = latestByName.get("ALT");
  const hba1c = latestByName.get("HbA1c");
  if (alt?.trend === "rising" || hba1c?.trend === "rising") {
    out[0] = {
      ...out[0],
      tone: "warning",
      detail: [alt?.trend === "rising" ? "ALT rising" : null, hba1c?.trend === "rising" ? "HbA1c rising" : null]
        .filter(Boolean)
        .join(", "),
    };
  }

  return out;
}

function buildReportGroups(
  reports: Awaited<ReturnType<typeof db.query.clinicalReports.findMany>>
): DashboardReportGroup[] {
  const groups = new Map<string, DashboardReportGroup>();
  for (const report of reports) {
    const key = (report.specialty ?? report.reportType ?? "other").toLowerCase();
    const label = report.specialty ? titleize(report.specialty) : titleize(report.reportType);
    const date = report.reportDate
      ? new Date(report.reportDate).toISOString()
      : report.createdAt.toISOString();
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        key,
        label,
        count: 1,
        followUpCount: report.followUpRecommended ? 1 : 0,
        latestDate: date,
        latestSummary: report.summary ?? report.impression,
      });
      continue;
    }
    existing.count += 1;
    if (report.followUpRecommended) existing.followUpCount += 1;
    if (!existing.latestDate || date > existing.latestDate) {
      existing.latestDate = date;
      existing.latestSummary = report.summary ?? report.impression;
    }
  }
  return [...groups.values()].sort((a, b) => {
    if (a.followUpCount !== b.followUpCount) return b.followUpCount - a.followUpCount;
    return (b.latestDate ?? "").localeCompare(a.latestDate ?? "");
  });
}

function latestOf(cards: MetricCard[], name: string) {
  return cards.find((c) => c.name === name)?.latest?.value ?? null;
}

async function loadMarkers(profileId: string, start: Date | null): Promise<DashboardMarker[]> {
  const docs = await db.query.documents.findMany({
    where: eq(schema.documents.profileId, profileId),
    orderBy: [asc(schema.documents.uploadedAt)],
  });
  const markers: DashboardMarker[] = docs
    .filter((d) =>
      ["prescription", "imaging", "specialist_report", "discharge_summary", "genetic_report"].includes(
        d.documentType
      )
    )
    .map((d) => ({
      date: (d.documentDate ? new Date(d.documentDate) : d.uploadedAt).toISOString(),
      label:
        d.documentType === "prescription"
          ? "Prescription"
          : d.documentType === "imaging"
            ? "Imaging"
            : d.documentType === "genetic_report"
              ? "Genetic report"
              : "Specialist report",
      kind: d.documentType === "prescription" ? ("prescription" as const) : ("report" as const),
    }));

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

  return markers
    .filter((m) => !start || new Date(m.date) >= start)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function getAdaptiveDashboardData(
  profileId: string,
  range: DashboardRange
): Promise<AdaptiveDashboardData> {
  const start = rangeStart(range);

  const conditions = [
    eq(schema.observations.profileId, profileId),
    eq(schema.observations.status, "confirmed"),
  ];
  if (start) conditions.push(gte(schema.observations.observedAt, start));

  const rows = await db
    .select({
      observedAt: schema.observations.observedAt,
      valueNumeric: schema.observations.valueNumeric,
      unit: schema.observations.unit,
      referenceLow: schema.observations.referenceLow,
      referenceHigh: schema.observations.referenceHigh,
      interpretation: schema.observations.interpretation,
      observationTypeId: schema.observations.observationTypeId,
      typeName: schema.observationTypes.canonicalName,
      category: schema.observationTypes.category,
      normalUnit: schema.observationTypes.normalUnit,
    })
    .from(schema.observations)
    .innerJoin(
      schema.observationTypes,
      eq(schema.observations.observationTypeId, schema.observationTypes.id)
    )
    .where(and(...conditions))
    .orderBy(asc(schema.observations.observedAt));

  const reportConditions = [eq(schema.clinicalReports.profileId, profileId)];
  if (start) reportConditions.push(gte(schema.clinicalReports.createdAt, start));
  const reports = await db.query.clinicalReports.findMany({
    where: and(...reportConditions),
    orderBy: [desc(schema.clinicalReports.createdAt)],
    limit: 50,
  });

  const cards = buildCards(rows);
  const reportGroups = buildReportGroups(reports);
  const sections = buildSections(cards);
  const alt = latestOf(cards, "ALT");
  const ast = latestOf(cards, "AST");
  const tg = latestOf(cards, "Triglycerides");
  const hdl = latestOf(cards, "HDL");
  const latestDate =
    cards
      .map((c) => c.latest?.date)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null;

  const derived = {
    astAltRatio: alt && ast ? Number((ast / alt).toFixed(2)) : null,
    tgHdlRatio: tg && hdl ? Number((tg / hdl).toFixed(2)) : null,
    altTrend: cards.find((c) => c.name === "ALT")?.trend ?? null,
    hba1cTrend: cards.find((c) => c.name === "HbA1c")?.trend ?? null,
    abnormalCount: rows.filter((r) => isAbnormal(r.interpretation)).length,
    totalCount: rows.length,
    activeCategoryCount: new Set(cards.map((c) => c.category)).size,
    reportGroupCount: reportGroups.length,
    latestDate,
  };

  const markers = await loadMarkers(profileId, start);
  const focus = buildFocus({ cards, rows, reportGroups });

  return {
    range,
    focus,
    sections,
    derived,
    reportGroups,
    markers,
  };
}

export const getMetabolicLiverData = getAdaptiveDashboardData;
