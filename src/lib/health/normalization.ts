const FRACTIONAL_PERCENT_METRICS = new Set([
  "Body Fat Percentage",
  "Oxygen Saturation",
  "Walking Asymmetry Percentage",
  "Walking Double Support Percentage",
  "Walking Steadiness",
]);

const THOUSAND_COUNT_METRICS = new Set([
  "Corrected WBC Count",
  "Platelet Count",
  "WBC Count",
]);

const ABSOLUTE_COUNT_METRICS = new Set([
  "Absolute Basophil Count",
  "Absolute Eosinophil Count",
  "Absolute Lymphocyte Count",
  "Absolute Monocyte Count",
  "Absolute Neutrophil Count",
]);

const NONPOSITIVE_IMPOSSIBLE_METRICS = new Set([
  "BMI",
  "Body Fat Percentage",
  "Height",
  "Lean Body Mass",
  "Weight",
]);

export type MetricNormalizationInput = {
  metric: string;
  normalUnit?: string | null;
  unit: string | null;
  valueNumeric: number | null;
  referenceLow?: number | null;
  referenceHigh?: number | null;
};

function simplifyUnit(unit: string | null | undefined): string {
  return (unit ?? "")
    .trim()
    .toLowerCase()
    .replace(/[µμ]/g, "u")
    .replace(/³/g, "^3")
    .replace(/⁶/g, "^6")
    .replace(/\s+/g, "")
    .replace(/cumm/g, "cu.mm")
    .replace(/mcl/g, "ul");
}

function canonicalUnit(metric: string, unit: string | null, normalUnit?: string | null): string | null {
  const raw = unit?.trim();
  const normalized = simplifyUnit(raw);
  const canonical = normalUnit?.trim() || null;
  const canonicalNormalized = simplifyUnit(canonical);

  if (!raw) return canonical;
  if (canonical && normalized === canonicalNormalized) return canonical;
  if (metric === "BMI" && normalized === "count") return canonical ?? raw;
  if (FRACTIONAL_PERCENT_METRICS.has(metric) && normalized === "%") return "%";

  if (THOUSAND_COUNT_METRICS.has(metric)) {
    if (
      normalized === "cells/cu.mm" ||
      normalized === "cells/ul" ||
      normalized === "k/ul" ||
      normalized === "10^3/ul"
    ) {
      return canonical ?? "10³/µL";
    }
  }

  if (metric === "RBC Count") {
    if (
      normalized === "million/cu.mm" ||
      normalized === "mil/ul" ||
      normalized === "10^6/ul"
    ) {
      return canonical ?? "10⁶/µL";
    }
  }

  if (ABSOLUTE_COUNT_METRICS.has(metric)) {
    if (normalized === "cells/cu.mm" || normalized === "cells/ul") {
      return canonical ?? "cells/µL";
    }
  }

  return raw;
}

function scaleFactor(input: MetricNormalizationInput): number {
  const unit = simplifyUnit(input.unit);
  const values = [input.valueNumeric, input.referenceLow ?? null, input.referenceHigh ?? null].filter(
    (value): value is number => value != null
  );

  if (
    FRACTIONAL_PERCENT_METRICS.has(input.metric) &&
    unit === "%" &&
    values.some((value) => value > 0 && value < 1)
  ) {
    return 100;
  }

  if (
    THOUSAND_COUNT_METRICS.has(input.metric) &&
    (unit === "cells/cu.mm" || unit === "cells/ul")
  ) {
    return 1 / 1000;
  }

  return 1;
}

export function normalizeMetricRecord(input: MetricNormalizationInput) {
  const factor = scaleFactor(input);
  const scale = (value: number | null | undefined) => {
    if (value == null) return null;
    if (factor === 1) return value;
    return Number((value * factor).toPrecision(12));
  };
  return {
    unit: canonicalUnit(input.metric, input.unit, input.normalUnit),
    valueNumeric: scale(input.valueNumeric),
    referenceLow: scale(input.referenceLow),
    referenceHigh: scale(input.referenceHigh),
  };
}

export function isImplausibleMetricObservation(metric: string, valueNumeric: number | null): boolean {
  if (valueNumeric == null) return false;
  return NONPOSITIVE_IMPOSSIBLE_METRICS.has(metric) && valueNumeric <= 0;
}
