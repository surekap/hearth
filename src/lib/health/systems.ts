/**
 * Single source of truth for body systems: which observation categories and
 * metric names belong to each system, which media asset headers it, and which
 * terms match related genetic assessments and clinical reports.
 */

export type SystemId =
  | "cardiovascular"
  | "blood"
  | "kidney"
  | "metabolic"
  | "body-composition"
  | "bone"
  | "sleep"
  | "activity"
  | "nutrition"
  | "respiratory"
  | "immune";

export type SystemMedia = {
  image: string;
  video?: string;
  position: string;
  tone: "light" | "dark";
};

export type SystemDef = {
  id: SystemId;
  title: string;
  eyebrow: string;
  description: string;
  /** Observation categories whose metrics belong to this system. */
  categories: string[];
  /** Extra canonical names included regardless of category (e.g. DEXA in `body`). */
  metricNames: string[];
  /** Headline metrics charted on the system page, in order. */
  keyMetrics: string[];
  /** First of these with data becomes the overview gallery hero value. */
  heroMetrics: string[];
  media?: SystemMedia;
  geneticTerms: string[];
  reportTerms: string[];
};

export const SYSTEMS: SystemDef[] = [
  {
    id: "cardiovascular",
    title: "Heart & circulation",
    eyebrow: "Cardiovascular",
    description:
      "Blood pressure, pulse, heart-rate variability and blood fats move cardiovascular risk together.",
    categories: ["cardiovascular", "cardiac", "lipid"],
    metricNames: [],
    keyMetrics: [
      "Resting Heart Rate",
      "HRV",
      "Blood Pressure Systolic",
      "LDL",
      "HDL",
      "Triglycerides",
      "Total Cholesterol",
    ],
    heroMetrics: ["Resting Heart Rate", "LDL", "HRV"],
    media: {
      image: "/images/heart-circulatory.png",
      video: "/images/heart-circulatory.mp4",
      position: "50% 42%",
      tone: "light",
    },
    geneticTerms: ["heart", "cardio", "atrial", "coronary", "cholesterol", "hypertension", "thrombo"],
    reportTerms: ["cardio"],
  },
  {
    id: "blood",
    title: "Blood counts",
    eyebrow: "Hematology",
    description:
      "Hemoglobin carries oxygen, white cells fight infection, platelets and clotting factors stop bleeding.",
    categories: ["hematology", "coagulation"],
    metricNames: [],
    keyMetrics: ["Hemoglobin", "WBC Count", "Platelet Count", "RBC Count", "Ferritin"],
    heroMetrics: ["Hemoglobin", "WBC Count"],
    geneticTerms: ["anemia", "thalass", "clot", "hemochromatosis", "factor"],
    reportTerms: ["hematol"],
  },
  {
    id: "kidney",
    title: "Kidney & urine",
    eyebrow: "Renal",
    description:
      "Creatinine and eGFR describe filtration; urine markers can show leakage or irritation early.",
    categories: ["renal", "urine"],
    metricNames: [],
    keyMetrics: ["Creatinine", "eGFR", "Urea", "Uric Acid"],
    heroMetrics: ["eGFR", "Creatinine"],
    media: {
      image: "/images/kidney-urinary.png",
      video: "/images/kidney-urinary.mp4",
      position: "50% 50%",
      tone: "dark",
    },
    geneticTerms: ["kidney", "renal"],
    reportTerms: ["nephro", "urol"],
  },
  {
    id: "metabolic",
    title: "Metabolic, liver & hormones",
    eyebrow: "Energy systems",
    description:
      "Glucose control, liver enzymes, thyroid, inflammation and key vitamins influence each other.",
    categories: ["liver", "glucose", "inflammation", "thyroid", "hormone", "vitamin", "mineral"],
    metricNames: [],
    keyMetrics: ["HbA1c", "Fasting Glucose", "ALT", "AST", "GGT", "TSH", "CRP", "Vitamin D"],
    heroMetrics: ["HbA1c", "ALT", "Fasting Glucose"],
    media: { image: "/images/liver-metabolism.png", position: "50% 45%", tone: "light" },
    geneticTerms: ["diabetes", "liver", "thyroid", "gilbert", "fatty", "metabol"],
    reportTerms: ["gastro", "endocrin", "hepat"],
  },
  {
    id: "body-composition",
    title: "Body composition",
    eyebrow: "Body",
    description:
      "Weight, BMI, fat percentage, lean mass and visceral fat read as one picture across DEXA and wearables.",
    categories: ["body"],
    metricNames: [],
    keyMetrics: ["Weight", "BMI", "Body Fat Percentage", "Lean Body Mass", "Waist Circumference"],
    heroMetrics: ["Weight", "BMI"],
    media: { image: "/images/body-composition.png", position: "50% 38%", tone: "light" },
    geneticTerms: ["obesity", "weight"],
    reportTerms: [],
  },
  {
    id: "bone",
    title: "Bone density",
    eyebrow: "DEXA",
    description: "Bone mineral density with its T- and Z-scores, straight from DEXA scans.",
    categories: [],
    metricNames: [
      "DEXA total body BMD",
      "DEXA total body T-score",
      "DEXA total body Z-score",
      "Total body bone mineral content",
    ],
    keyMetrics: ["DEXA total body T-score", "DEXA total body BMD"],
    heroMetrics: ["DEXA total body T-score"],
    geneticTerms: ["osteo", "bone"],
    reportTerms: ["dexa", "ortho"],
  },
  {
    id: "sleep",
    title: "Sleep & recovery",
    eyebrow: "Sleep",
    description:
      "Time asleep and sleep stages show whether recovery is actually happening overnight.",
    categories: ["sleep"],
    metricNames: [],
    keyMetrics: ["Sleep Duration", "Sleep Deep Duration", "Sleep REM Duration"],
    heroMetrics: ["Sleep Duration"],
    media: {
      image: "/images/sleep-recovery.png",
      video: "/images/sleep-recovery.mp4",
      position: "50% 45%",
      tone: "light",
    },
    geneticTerms: ["sleep", "insomnia", "caffeine"],
    reportTerms: [],
  },
  {
    id: "activity",
    title: "Activity & movement",
    eyebrow: "Movement",
    description: "Daily movement, workouts, walking quality and environmental exposure.",
    categories: ["activity", "mobility", "environment"],
    metricNames: [],
    keyMetrics: [
      "Flights Climbed",
      "Exercise Time",
      "Six Minute Walk Test Distance",
      "Walking Steadiness",
    ],
    heroMetrics: ["Exercise Time", "Flights Climbed"],
    geneticTerms: ["muscle", "endurance"],
    reportTerms: ["physio", "ortho"],
  },
  {
    id: "nutrition",
    title: "Nutrition",
    eyebrow: "Diet",
    description: "Logged dietary energy and macro/micronutrients.",
    categories: ["nutrition"],
    metricNames: [],
    keyMetrics: [
      "Dietary Energy Consumed",
      "Dietary Protein",
      "Dietary Carbohydrates",
      "Dietary Fat Total",
      "Dietary Fiber",
      "Dietary Sodium",
    ],
    heroMetrics: ["Dietary Energy Consumed"],
    geneticTerms: ["lactose", "celiac", "vitamin"],
    reportTerms: ["nutrition", "diet"],
  },
  {
    id: "respiratory",
    title: "Lungs & breathing",
    eyebrow: "Respiratory",
    description: "Oxygen saturation and breathing rate from wearables and clinical measurements.",
    categories: ["respiratory"],
    metricNames: [],
    keyMetrics: ["Oxygen Saturation", "Respiratory Rate"],
    heroMetrics: ["Oxygen Saturation"],
    geneticTerms: ["asthma", "lung", "pulmonary"],
    reportTerms: ["pulmo", "chest"],
  },
  {
    id: "immune",
    title: "Immune & allergies",
    eyebrow: "Immunity",
    description: "Allergy panels, autoimmune markers, infections and screening markers.",
    categories: ["allergy", "autoimmune", "infectious", "tumor_marker", "other"],
    metricNames: [],
    keyMetrics: [],
    heroMetrics: [],
    geneticTerms: ["immune", "allerg", "autoimmun"],
    reportTerms: ["immuno", "allerg"],
  },
];

export function systemFor(id: string): SystemDef | undefined {
  return SYSTEMS.find((s) => s.id === id);
}

export function metricBelongsTo(
  def: SystemDef,
  metric: { category: string; name: string }
): boolean {
  if (def.metricNames.length > 0) {
    if (def.metricNames.includes(metric.name)) return true;
    if (def.categories.length === 0) return false;
  }
  return def.categories.includes(metric.category);
}

export const CATEGORY_LABELS: Record<string, string> = {
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

export function categoryLabel(category: string): string {
  return (
    CATEGORY_LABELS[category] ??
    category
      .split(/[_\s-]+/)
      .filter(Boolean)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(" ")
  );
}
