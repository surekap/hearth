import type { AiContext } from "./context";
import { summarizeChanges } from "./changes";
export const documentA = "11111111-1111-4111-8111-111111111111";
export const documentB = "22222222-2222-4222-8222-222222222222";
export function fixtureContext(): AiContext {
  const observations: AiContext["observations"] = [
    { test: "Weight", category: "body", date: "2026-03-17", value: 100.6, unit: "kg", referenceLow: null, referenceHigh: null, interpretation: "unknown", documentId: documentA },
    { test: "Weight", category: "body", date: "2026-09-01", value: 90, unit: "kg", referenceLow: null, referenceHigh: null, interpretation: "unknown", documentId: documentB },
    { test: "ALT", category: "liver", date: "2026-03-17", value: 100, unit: "U/L", referenceLow: null, referenceHigh: 50, interpretation: "high", documentId: documentA },
    { test: "ALT", category: "liver", date: "2026-09-01", value: 60, unit: "U/L", referenceLow: null, referenceHigh: 50, interpretation: "high", documentId: documentB },
    { test: "Lean mass", category: "body", date: "2026-03-17", value: 57.2, unit: "kg", referenceLow: null, referenceHigh: null, interpretation: "unknown", documentId: documentA, study: "DEXA" },
    { test: "Lean mass", category: "body", date: "2026-09-01", value: 56, unit: "kg", referenceLow: null, referenceHigh: null, interpretation: "unknown", documentId: documentB, study: "DEXA" },
  ];
  return {
    profile: { relationship: "self", ageYears: 40, sexAtBirth: "male" }, observations,
    changes: summarizeChanges(observations, { windowMonths: 6, now: new Date("2026-09-09") }),
    reports: [
      { date: "2026-06-09", type: "imaging", study: "Ultrasound", specialty: null, summary: "Grade I–II fatty liver", impression: "Mild hepatomegaly", findings: ["No gallstones seen"], documentId: documentA, page: 2 },
      { date: "2026-09-01", type: "imaging", study: "Ultrasound", specialty: null, summary: "Grade I fatty liver", impression: "Multiple gallstones, largest 10 mm", findings: ["Normal liver size"], documentId: documentB, page: 3 },
    ],
    diagnoses: [], healthRollups: [], healthEvents: [], patientReported: [],
    genomics: { reports: [], risks: [], pharmacogenomics: [] },
    timeRange: { from: "2026-03-17", to: "2026-09-01" },
  };
}
