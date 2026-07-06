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

export type DashboardSystemMetric = {
  label: string;
  value: string;
  detail: string;
  status: "normal" | "watch" | "attention" | "unknown";
};

export type DashboardSystemVisual = {
  label: string;
  value: string;
  points: number[];
  pointLabels: string[];
  score: number | null;
};

export type DashboardSystemWidget = {
  id: string;
  title: string;
  eyebrow: string;
  summary: string;
  detail: string;
  tone: "neutral" | "warning" | "danger" | "success";
  metrics: DashboardSystemMetric[];
  visual: DashboardSystemVisual;
  relatedSectionIds: string[];
  reportCount: number;
};

export type DashboardMarker = {
  date: string;
  label: string;
  kind: "report" | "prescription" | "document" | "medication";
};

export type AdaptiveDashboardData = {
  range: DashboardRange;
  focus: DashboardFocus[];
  systemWidgets: DashboardSystemWidget[];
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

function formatMetricValue(card: MetricCard | undefined) {
  if (!card?.latest) return "No data";
  if (card.name === "Body Fat Percentage" && card.unit === "%" && card.latest.value > 0 && card.latest.value < 1) {
    return `${Number((card.latest.value * 100).toFixed(1))}%`;
  }
  if (card.name === "BMI") return String(card.latest.value);
  return `${card.latest.value}${card.unit ? ` ${card.unit}` : ""}`;
}

function metricStatus(card: MetricCard | undefined): DashboardSystemMetric["status"] {
  if (!card?.latest) return "unknown";
  if (card.latest.interpretation === "critical" || isAbnormal(card.latest.interpretation)) {
    return "attention";
  }
  if (card.trend && card.trend !== "flat") return "watch";
  if (card.latest.interpretation === "normal") return "normal";
  return "unknown";
}

function plainTrend(card: MetricCard | undefined) {
  if (!card?.trend || card.trend === "flat") return "latest value";
  return `${card.trend} trend`;
}

function makeMetric(cardsByName: Map<string, MetricCard>, name: string, label = name): DashboardSystemMetric {
  const card = cardsByName.get(name);
  return {
    label,
    value: formatMetricValue(card),
    detail: card?.latest ? plainTrend(card) : "not measured yet",
    status: metricStatus(card),
  };
}

function firstCard(cardsByName: Map<string, MetricCard>, names: string[]) {
  return names.map((name) => cardsByName.get(name)).find((card) => card?.latest);
}

function visualPoints(card: MetricCard | undefined) {
  if (!card) return [];
  return card.points
    .slice(-16)
    .map((point) => point.value)
    .filter((value) => Number.isFinite(value));
}

function visualPointLabels(card: MetricCard | undefined) {
  if (!card) return [];
  return card.points.slice(-16).map((point) =>
    new Date(point.date).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
    })
  );
}

function bodyFatPercent(card: MetricCard | undefined) {
  if (!card?.latest) return null;
  if (card.name !== "Body Fat Percentage") return null;
  const value = card.latest.value;
  if (card.unit === "%" && value > 0 && value < 1) return Number((value * 100).toFixed(1));
  return value;
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

function visualFromCard(card: MetricCard | undefined, label = card?.name ?? "Data"): DashboardSystemVisual {
  return {
    label,
    value: formatMetricValue(card),
    points: visualPoints(card),
    pointLabels: visualPointLabels(card),
    score: null,
  };
}

function bodyCompositionVisual(cardsByName: Map<string, MetricCard>): DashboardSystemVisual {
  const fatCard = cardsByName.get("Body Fat Percentage");
  const bmiCard = cardsByName.get("BMI");
  const fat = bodyFatPercent(fatCard);
  const bmi = bmiCard?.latest?.value ?? null;
  return {
    label: fat != null ? "Body fat" : "BMI",
    value: fat != null ? `${fat}%` : formatMetricValue(bmiCard),
    points: visualPoints(fatCard ?? bmiCard),
    pointLabels: visualPointLabels(fatCard ?? bmiCard),
    score: fat != null ? clampPercent(fat) : bmi != null ? clampPercent((bmi / 40) * 100) : null,
  };
}

function summarizeSystem(input: {
  availableCards: MetricCard[];
  abnormalCards: MetricCard[];
  watchCards: MetricCard[];
  normalLabel: string;
  attentionLabel: string;
  watchLabel: string;
  missingLabel: string;
}) {
  if (input.availableCards.length === 0) return input.missingLabel;
  if (input.abnormalCards.length > 0) {
    return `${input.attentionLabel}: ${input.abnormalCards
      .slice(0, 3)
      .map((c) => c.name)
      .join(", ")}.`;
  }
  if (input.watchCards.length > 0) {
    return `${input.watchLabel}: ${input.watchCards
      .slice(0, 3)
      .map((c) => c.name)
      .join(", ")}.`;
  }
  return input.normalLabel;
}

function widgetTone(cards: MetricCard[], reportGroups: DashboardReportGroup[] = []): DashboardSystemWidget["tone"] {
  if (cards.some((c) => c.latest?.interpretation === "critical" || isAbnormal(c.latest?.interpretation))) {
    return "danger";
  }
  if (cards.some((c) => c.trend && c.trend !== "flat") || reportGroups.some((g) => g.followUpCount > 0)) {
    return "warning";
  }
  if (cards.some((c) => c.latest) || reportGroups.length > 0) return "success";
  return "neutral";
}

function reportGroupMatches(group: DashboardReportGroup, terms: string[]) {
  const haystack = `${group.key} ${group.label}`.toLowerCase();
  return terms.some((term) => haystack.includes(term));
}

function reportSystemWidget(input: {
  id: string;
  title: string;
  eyebrow: string;
  terms: string[];
  reportGroups: DashboardReportGroup[];
  defaultSummary: string;
  defaultDetail: string;
}): DashboardSystemWidget | null {
  const groups = input.reportGroups.filter((group) => reportGroupMatches(group, input.terms));
  if (groups.length === 0) return null;
  const followUps = groups.reduce((sum, group) => sum + group.followUpCount, 0);
  const reportCount = groups.reduce((sum, group) => sum + group.count, 0);
  const latest = groups
    .map((group) => group.latestDate)
    .filter(Boolean)
    .sort()
    .at(-1);

  return {
    id: input.id,
    title: input.title,
    eyebrow: input.eyebrow,
    summary:
      followUps > 0
        ? `${followUps} follow-up item${followUps === 1 ? "" : "s"} flagged in recent reports.`
        : input.defaultSummary,
    detail: groups[0]?.latestSummary ?? input.defaultDetail,
    tone: followUps > 0 ? "warning" : "success",
    metrics: [
      {
        label: "Reports",
        value: String(reportCount),
        detail: latest
          ? `latest ${new Date(latest).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`
          : "available",
        status: followUps > 0 ? "watch" : "normal",
      },
    ],
    visual: {
      label: "Reports",
      value: String(reportCount),
      points: [],
      pointLabels: [],
      score: null,
    },
    relatedSectionIds: [],
    reportCount,
  };
}

function buildSystemWidgets(input: {
  cards: MetricCard[];
  sections: DashboardSection[];
  reportGroups: DashboardReportGroup[];
  derived: AdaptiveDashboardData["derived"];
}): DashboardSystemWidget[] {
  const cardsByName = new Map(input.cards.map((card) => [card.name, card]));
  const sectionIds = new Set(input.sections.map((section) => section.id));
  const cardsIn = (categories: string[]) => input.cards.filter((card) => categories.includes(card.category));
  const abnormalIn = (cards: MetricCard[]) => cards.filter((card) => isAbnormal(card.latest?.interpretation));
  const watchIn = (cards: MetricCard[]) => cards.filter((card) => card.trend && card.trend !== "flat");
  const hasSection = (id: string) => sectionIds.has(id);
  const maybeSections = (...ids: string[]) => ids.filter(hasSection);

  const cardiovascularCards = [
    ...cardsIn(["cardiovascular", "cardiac", "lipid"]),
    ...["HbA1c", "Fasting Glucose", "CRP", "BMI"].map((name) => cardsByName.get(name)).filter(Boolean),
  ] as MetricCard[];
  const bloodCards = cardsIn(["hematology", "coagulation"]);
  const kidneyCards = cardsIn(["renal", "urine"]);
  const metabolicCards = cardsIn(["liver", "glucose", "body", "inflammation"]);
  const sleepCards = cardsIn(["sleep"]);
  const bodyCompositionCards = [
    ...[
      "BMI",
      "Basal Energy Burned",
      "Body Fat Percentage",
      "Lean Body Mass",
      "Weight",
      "Waist Circumference",
    ]
      .map((name) => cardsByName.get(name))
      .filter(Boolean),
  ] as MetricCard[];

  const widgets: DashboardSystemWidget[] = [];

  if (cardiovascularCards.length > 0) {
    widgets.push({
      id: "cardiovascular",
      title: "Heart & circulation",
      eyebrow: "Cardiovascular",
      summary: summarizeSystem({
        availableCards: cardiovascularCards,
        abnormalCards: abnormalIn(cardiovascularCards),
        watchCards: watchIn(cardiovascularCards),
        normalLabel: "Heart-related markers look steady in the latest confirmed data.",
        attentionLabel: "Worth reviewing",
        watchLabel: "Changing over time",
        missingLabel: "Add blood pressure, pulse, lipids or glucose to build this view.",
      }),
      detail:
        "Blood pressure, pulse, cholesterol and glucose are shown together because they often move risk in the same direction.",
      tone: widgetTone(cardiovascularCards),
      metrics: [
        makeMetric(cardsByName, "Blood Pressure Systolic", "Systolic BP"),
        makeMetric(cardsByName, "Blood Pressure Diastolic", "Diastolic BP"),
        makeMetric(cardsByName, "LDL"),
        makeMetric(cardsByName, "HbA1c"),
      ],
      visual: visualFromCard(
        firstCard(cardsByName, ["Resting Heart Rate", "Heart Rate", "LDL", "HbA1c"]),
        "Heart trend"
      ),
      relatedSectionIds: maybeSections("cardiovascular", "metabolic", "attention"),
      reportCount: 0,
    });
  }

  if (bloodCards.length > 0) {
    widgets.push({
      id: "blood-counts",
      title: "Blood counts",
      eyebrow: "CBC",
      summary: summarizeSystem({
        availableCards: bloodCards,
        abnormalCards: abnormalIn(bloodCards),
        watchCards: watchIn(bloodCards),
        normalLabel: "The latest blood count markers are not currently flagged.",
        attentionLabel: "Blood count values to review",
        watchLabel: "Blood count values changing",
        missingLabel: "Add a complete blood count to build this view.",
      }),
      detail:
        "Hemoglobin reflects oxygen-carrying capacity, white cells reflect immune activity, and platelets help clotting.",
      tone: widgetTone(bloodCards),
      metrics: [
        makeMetric(cardsByName, "Hemoglobin"),
        makeMetric(cardsByName, "WBC Count", "White cells"),
        makeMetric(cardsByName, "Platelet Count", "Platelets"),
        makeMetric(cardsByName, "Ferritin"),
      ],
      visual: visualFromCard(firstCard(cardsByName, ["Hemoglobin", "WBC Count", "Platelet Count"]), "CBC trend"),
      relatedSectionIds: maybeSections("hematology", "attention"),
      reportCount: 0,
    });
  }

  if (kidneyCards.length > 0) {
    widgets.push({
      id: "kidney",
      title: "Kidney & urine",
      eyebrow: "Renal",
      summary: summarizeSystem({
        availableCards: kidneyCards,
        abnormalCards: abnormalIn(kidneyCards),
        watchCards: watchIn(kidneyCards),
        normalLabel: "Kidney filtration and urine markers are not currently flagged.",
        attentionLabel: "Kidney markers to review",
        watchLabel: "Kidney markers changing",
        missingLabel: "Add creatinine, eGFR or urine markers to build this view.",
      }),
      detail:
        "Creatinine and eGFR describe filtration, while urine markers can show leakage or irritation before symptoms appear.",
      tone: widgetTone(kidneyCards),
      metrics: [
        makeMetric(cardsByName, "Creatinine"),
        makeMetric(cardsByName, "eGFR"),
        makeMetric(cardsByName, "Urea"),
        makeMetric(cardsByName, "Urine Albumin Creatinine Ratio", "Urine ACR"),
      ],
      visual: visualFromCard(firstCard(cardsByName, ["Creatinine", "eGFR", "Urea"]), "Kidney trend"),
      relatedSectionIds: maybeSections("metabolic", "renal", "urine", "attention"),
      reportCount: 0,
    });
  }

  if (metabolicCards.length > 0) {
    widgets.push({
      id: "metabolic",
      title: "Metabolic & liver",
      eyebrow: "Energy systems",
      summary: summarizeSystem({
        availableCards: metabolicCards,
        abnormalCards: abnormalIn(metabolicCards),
        watchCards: watchIn(metabolicCards),
        normalLabel: "Glucose, liver and inflammation markers look steady in the latest data.",
        attentionLabel: "Metabolic markers to review",
        watchLabel: "Metabolic markers changing",
        missingLabel: "Add glucose, liver enzymes or body measures to build this view.",
      }),
      detail:
        input.derived.tgHdlRatio != null
          ? `TG/HDL is ${input.derived.tgHdlRatio}, which links fats in the blood with insulin and energy handling.`
          : "Glucose, weight, liver enzymes and inflammation are grouped because they often influence each other.",
      tone: widgetTone(metabolicCards),
      metrics: [
        makeMetric(cardsByName, "HbA1c"),
        makeMetric(cardsByName, "ALT"),
        makeMetric(cardsByName, "Triglycerides"),
        makeMetric(cardsByName, "CRP"),
      ],
      visual: visualFromCard(firstCard(cardsByName, ["HbA1c", "ALT", "Triglycerides", "CRP"]), "Metabolic trend"),
      relatedSectionIds: maybeSections("metabolic", "attention"),
      reportCount: 0,
    });
  }

  if (sleepCards.length > 0) {
    widgets.push({
      id: "sleep",
      title: "Sleep & recovery",
      eyebrow: "Sleep tracking",
      summary: summarizeSystem({
        availableCards: sleepCards,
        abnormalCards: abnormalIn(sleepCards),
        watchCards: watchIn(sleepCards),
        normalLabel: "Sleep duration and stages look steady in the latest data.",
        attentionLabel: "Sleep markers to review",
        watchLabel: "Sleep markers changing",
        missingLabel: "Add sleep duration and stage data to build this view.",
      }),
      detail:
        "Time asleep, time in bed, deep sleep and REM are grouped to show whether recovery is actually happening overnight.",
      tone: widgetTone(sleepCards),
      metrics: [
        makeMetric(cardsByName, "Sleep Duration", "Asleep"),
        makeMetric(cardsByName, "Sleep Duration Goal", "Goal"),
        makeMetric(cardsByName, "Sleep Deep Duration", "Deep"),
        makeMetric(cardsByName, "Sleep REM Duration", "REM"),
      ],
      visual: visualFromCard(
        firstCard(cardsByName, ["Sleep Duration", "Sleep In Bed Duration", "Sleep Duration Goal"]),
        "Sleep trend"
      ),
      relatedSectionIds: maybeSections("sleep", "attention"),
      reportCount: 0,
    });
  }

  if (bodyCompositionCards.length > 0) {
    widgets.push({
      id: "body-composition",
      title: "Body composition",
      eyebrow: "BMI, BMR & muscle/fat",
      summary: summarizeSystem({
        availableCards: bodyCompositionCards,
        abnormalCards: abnormalIn(bodyCompositionCards),
        watchCards: watchIn(bodyCompositionCards),
        normalLabel: "Body composition markers look steady in the latest data.",
        attentionLabel: "Body composition markers to review",
        watchLabel: "Body composition changing",
        missingLabel: "Add BMI, BMR, fat or lean mass to build this view.",
      }),
      detail:
        "BMI, resting energy burn, fat percentage and lean mass are shown together so weight changes are easier to understand.",
      tone: widgetTone(bodyCompositionCards),
      metrics: [
        makeMetric(cardsByName, "BMI"),
        makeMetric(cardsByName, "Basal Energy Burned", "BMR"),
        makeMetric(cardsByName, "Body Fat Percentage", "Body fat"),
        makeMetric(cardsByName, "Lean Body Mass", "Lean mass"),
      ],
      visual: bodyCompositionVisual(cardsByName),
      relatedSectionIds: maybeSections("metabolic", "attention"),
      reportCount: 0,
    });
  }

  const reportWidgets = [
    reportSystemWidget({
      id: "dental",
      title: "Dental",
      eyebrow: "Mouth & teeth",
      terms: ["dental", "dentist", "oral", "orthodont", "periodont"],
      reportGroups: input.reportGroups,
      defaultSummary: "Dental reports are available for review.",
      defaultDetail: "Dental notes sit beside lab data so mouth health is not hidden in a document list.",
    }),
    reportSystemWidget({
      id: "eyes",
      title: "Eyes",
      eyebrow: "Ophthalmic",
      terms: ["ophthalm", "eye", "vision", "retina", "optometry"],
      reportGroups: input.reportGroups,
      defaultSummary: "Eye reports are available for review.",
      defaultDetail: "Eye findings are summarized here and can be reviewed from the source report.",
    }),
  ].filter(Boolean) as DashboardSystemWidget[];

  widgets.push(...reportWidgets);
  return widgets.slice(0, 10);
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
  const systemWidgets = buildSystemWidgets({ cards, sections, reportGroups, derived });

  return {
    range,
    focus,
    systemWidgets,
    sections,
    derived,
    reportGroups,
    markers,
  };
}

export const getMetabolicLiverData = getAdaptiveDashboardData;
