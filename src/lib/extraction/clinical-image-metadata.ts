import type { ExtractedReport } from "./schemas";

export function inferClinicalImageKind(report: ExtractedReport) {
  const value = [report.study_name, report.modality, report.body_part]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (/retina|retinal|fundus|oct\b/.test(value)) return "retinal";
  if (/dexa|dxa|densitometr|bone density|body composition|corescan/.test(value)) return "dexa";
  if (/ultrasound|ultrason|sonograph|echocardi|echo\b/.test(value)) return "ultrasound";
  if (/mri|magnetic resonance/.test(value)) return "mri";
  if (/\bct\b|computed tomography/.test(value)) return "ct";
  if (/x-ray|xray|radiograph/.test(value)) return "xray";
  if (/ecg|ekg|electrocard/.test(value)) return "ecg";
  if (/stress|treadmill|tmt\b|graph|chart/.test(value)) return "chart";
  return report.report_type === "imaging" ? "imaging" : "report_page";
}
