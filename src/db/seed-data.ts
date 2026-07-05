export type ObservationTypeSeed = {
  canonicalName: string;
  aliases: string[];
  category:
    | "liver"
    | "lipid"
    | "glucose"
    | "inflammation"
    | "renal"
    | "hematology"
    | "thyroid"
    | "vitamin"
    | "body"
    | "activity"
    | "sleep"
    | "cardiovascular"
    | "other";
  loincCode?: string;
  normalUnit?: string;
  description?: string;
};

export const OBSERVATION_TYPE_SEEDS: ObservationTypeSeed[] = [
  // Liver
  { canonicalName: "ALT", aliases: ["SGPT", "Alanine Aminotransferase", "Alanine Transaminase", "ALT (SGPT)", "SGPT (ALT)"], category: "liver", loincCode: "1742-6", normalUnit: "U/L", description: "Alanine aminotransferase, liver enzyme" },
  { canonicalName: "AST", aliases: ["SGOT", "Aspartate Aminotransferase", "Aspartate Transaminase", "AST (SGOT)", "SGOT (AST)"], category: "liver", loincCode: "1920-8", normalUnit: "U/L", description: "Aspartate aminotransferase, liver enzyme" },
  { canonicalName: "GGT", aliases: ["Gamma GT", "Gamma-Glutamyl Transferase", "GGTP", "Gamma Glutamyl Transpeptidase"], category: "liver", loincCode: "2324-2", normalUnit: "U/L", description: "Gamma-glutamyl transferase" },
  { canonicalName: "ALP", aliases: ["Alkaline Phosphatase", "SAP"], category: "liver", loincCode: "6768-6", normalUnit: "U/L", description: "Alkaline phosphatase" },
  { canonicalName: "Total Bilirubin", aliases: ["Bilirubin Total", "T. Bilirubin", "Bilirubin (Total)"], category: "liver", loincCode: "1975-2", normalUnit: "mg/dL", description: "Total bilirubin" },
  { canonicalName: "Direct Bilirubin", aliases: ["Bilirubin Direct", "Conjugated Bilirubin"], category: "liver", loincCode: "1968-7", normalUnit: "mg/dL", description: "Direct (conjugated) bilirubin" },
  { canonicalName: "Albumin", aliases: ["Serum Albumin"], category: "liver", loincCode: "1751-7", normalUnit: "g/dL", description: "Serum albumin" },
  { canonicalName: "Total Protein", aliases: ["Serum Protein", "Protein Total"], category: "liver", loincCode: "2885-2", normalUnit: "g/dL", description: "Total serum protein" },
  // Lipid
  { canonicalName: "Total Cholesterol", aliases: ["Cholesterol", "Serum Cholesterol", "Cholesterol Total"], category: "lipid", loincCode: "2093-3", normalUnit: "mg/dL", description: "Total cholesterol" },
  { canonicalName: "Triglycerides", aliases: ["TG", "Serum Triglycerides", "Trigs"], category: "lipid", loincCode: "2571-8", normalUnit: "mg/dL", description: "Triglycerides" },
  { canonicalName: "HDL", aliases: ["HDL Cholesterol", "HDL-C", "High Density Lipoprotein"], category: "lipid", loincCode: "2085-9", normalUnit: "mg/dL", description: "HDL cholesterol" },
  { canonicalName: "LDL", aliases: ["LDL Cholesterol", "LDL-C", "Low Density Lipoprotein", "LDL (Calculated)"], category: "lipid", loincCode: "13457-7", normalUnit: "mg/dL", description: "LDL cholesterol" },
  { canonicalName: "VLDL", aliases: ["VLDL Cholesterol", "Very Low Density Lipoprotein"], category: "lipid", loincCode: "13458-5", normalUnit: "mg/dL", description: "VLDL cholesterol" },
  { canonicalName: "Non-HDL Cholesterol", aliases: ["Non HDL", "Non-HDL-C"], category: "lipid", loincCode: "43396-1", normalUnit: "mg/dL", description: "Non-HDL cholesterol" },
  // Glucose
  { canonicalName: "HbA1c", aliases: ["Glycated Hemoglobin", "Glycosylated Hemoglobin", "A1c", "Hemoglobin A1c", "HBA1C"], category: "glucose", loincCode: "4548-4", normalUnit: "%", description: "Glycated hemoglobin, 3-month glucose average" },
  { canonicalName: "Fasting Glucose", aliases: ["FBS", "Fasting Blood Sugar", "Glucose Fasting", "Fasting Plasma Glucose", "FPG", "Blood Sugar Fasting"], category: "glucose", loincCode: "1558-6", normalUnit: "mg/dL", description: "Fasting blood glucose" },
  { canonicalName: "Postprandial Glucose", aliases: ["PPBS", "Post Prandial Blood Sugar", "Glucose PP", "PP Glucose", "2hr Glucose"], category: "glucose", loincCode: "1521-4", normalUnit: "mg/dL", description: "Post-prandial blood glucose" },
  { canonicalName: "Random Glucose", aliases: ["RBS", "Random Blood Sugar", "Glucose Random"], category: "glucose", loincCode: "2345-7", normalUnit: "mg/dL", description: "Random blood glucose" },
  { canonicalName: "Fasting Insulin", aliases: ["Insulin Fasting", "Serum Insulin"], category: "glucose", loincCode: "3701-0", normalUnit: "µIU/mL", description: "Fasting serum insulin" },
  { canonicalName: "HOMA-IR", aliases: ["Insulin Resistance Index"], category: "glucose", normalUnit: "", description: "Homeostatic model assessment of insulin resistance" },
  // Inflammation
  { canonicalName: "CRP", aliases: ["C-Reactive Protein", "C-Reactive Protein CRP", "C Reactive Protein", "C Reactive Protein CRP", "hs-CRP", "hsCRP", "High Sensitivity CRP"], category: "inflammation", loincCode: "1988-5", normalUnit: "mg/L", description: "C-reactive protein" },
  { canonicalName: "ESR", aliases: ["Erythrocyte Sedimentation Rate", "Sed Rate"], category: "inflammation", loincCode: "30341-2", normalUnit: "mm/hr", description: "Erythrocyte sedimentation rate" },
  // Renal
  { canonicalName: "Creatinine", aliases: ["Serum Creatinine", "S. Creatinine"], category: "renal", loincCode: "2160-0", normalUnit: "mg/dL", description: "Serum creatinine" },
  { canonicalName: "Urea", aliases: ["Blood Urea", "BUN", "Blood Urea Nitrogen"], category: "renal", loincCode: "3094-0", normalUnit: "mg/dL", description: "Blood urea" },
  { canonicalName: "Uric Acid", aliases: ["Serum Uric Acid", "S. Uric Acid"], category: "renal", loincCode: "3084-1", normalUnit: "mg/dL", description: "Serum uric acid" },
  { canonicalName: "eGFR", aliases: ["Estimated GFR", "Glomerular Filtration Rate"], category: "renal", loincCode: "62238-1", normalUnit: "mL/min/1.73m²", description: "Estimated glomerular filtration rate" },
  { canonicalName: "Sodium", aliases: ["Serum Sodium", "Na", "Na+"], category: "renal", loincCode: "2951-2", normalUnit: "mmol/L", description: "Serum sodium" },
  { canonicalName: "Potassium", aliases: ["Serum Potassium", "K", "K+"], category: "renal", loincCode: "2823-3", normalUnit: "mmol/L", description: "Serum potassium" },
  // Hematology
  { canonicalName: "Hemoglobin", aliases: ["Hb", "HGB", "Haemoglobin"], category: "hematology", loincCode: "718-7", normalUnit: "g/dL", description: "Hemoglobin" },
  { canonicalName: "WBC Count", aliases: ["Total Leukocyte Count", "Total Leukocyte Count TLC", "Total Leucocyte Count", "Total Leucocyte Count TLC", "TLC", "T.L.C", "White Blood Cell Count", "White Blood Cells", "WBC", "Total WBC", "Leukocyte Count", "Leucocyte Count"], category: "hematology", loincCode: "6690-2", normalUnit: "10³/µL", description: "White blood cell count" },
  { canonicalName: "Corrected WBC Count", aliases: ["Corrected TLC", "Corrected T.L.C", "Corrected Total Leukocyte Count", "Corrected Total Leukocyte Count TLC", "Corrected Total Leucocyte Count", "Corrected Total Leucocyte Count TLC", "Corrected WBC", "Corrected White Blood Cell Count"], category: "hematology", normalUnit: "10³/µL", description: "White blood cell count corrected for nucleated red blood cells" },
  { canonicalName: "Platelet Count", aliases: ["Platelets", "PLT"], category: "hematology", loincCode: "777-3", normalUnit: "10³/µL", description: "Platelet count" },
  { canonicalName: "MPV", aliases: ["Mean Platelet Volume", "Mean Platelet Volume MPV"], category: "hematology", loincCode: "32623-1", normalUnit: "fL", description: "Mean platelet volume" },
  { canonicalName: "RBC Count", aliases: ["Red Blood Cell Count", "Total RBC", "Erythrocyte Count"], category: "hematology", loincCode: "789-8", normalUnit: "10⁶/µL", description: "Red blood cell count" },
  { canonicalName: "Hematocrit", aliases: ["HCT", "PCV", "Packed Cell Volume"], category: "hematology", loincCode: "4544-3", normalUnit: "%", description: "Hematocrit" },
  { canonicalName: "MCV", aliases: ["Mean Corpuscular Volume"], category: "hematology", loincCode: "787-2", normalUnit: "fL", description: "Mean corpuscular volume" },
  { canonicalName: "MCH", aliases: ["Mean Corpuscular Hemoglobin", "Mean Corpuscular Haemoglobin"], category: "hematology", loincCode: "785-6", normalUnit: "pg", description: "Mean corpuscular hemoglobin" },
  { canonicalName: "MCHC", aliases: ["Mean Corpuscular Hemoglobin Concentration", "Mean Corpuscular Haemoglobin Concentration"], category: "hematology", loincCode: "786-4", normalUnit: "g/dL", description: "Mean corpuscular hemoglobin concentration" },
  { canonicalName: "RDW", aliases: ["R.D.W", "RDW-CV", "Red Cell Distribution Width", "Red Cell Distribution Width CV"], category: "hematology", loincCode: "788-0", normalUnit: "%", description: "Red cell distribution width" },
  { canonicalName: "Neutrophils", aliases: ["Neutrophil", "Neutrophils Percent", "Neutrophil Percent", "Neutrophils %"], category: "hematology", loincCode: "770-8", normalUnit: "%", description: "Neutrophils as a percentage of leukocytes" },
  { canonicalName: "Lymphocytes", aliases: ["Lymphocyte", "Lymphocytes Percent", "Lymphocyte Percent", "Lymphocytes %"], category: "hematology", loincCode: "736-9", normalUnit: "%", description: "Lymphocytes as a percentage of leukocytes" },
  { canonicalName: "Eosinophils", aliases: ["Eosinophil", "Eosinophils Percent", "Eosinophil Percent", "Eosinophils %"], category: "hematology", loincCode: "713-8", normalUnit: "%", description: "Eosinophils as a percentage of leukocytes" },
  { canonicalName: "Monocytes", aliases: ["Monocyte", "Monocytes Percent", "Monocyte Percent", "Monocytes %"], category: "hematology", loincCode: "5905-5", normalUnit: "%", description: "Monocytes as a percentage of leukocytes" },
  { canonicalName: "Basophils", aliases: ["Basophil", "Basophils Percent", "Basophil Percent", "Basophils %"], category: "hematology", loincCode: "706-2", normalUnit: "%", description: "Basophils as a percentage of leukocytes" },
  { canonicalName: "Absolute Neutrophil Count", aliases: ["ANC", "Abs Neutrophils", "Absolute Neutrophils", "Absolute Neutrophil", "Absolute Leukocyte Count Neutrophils", "Absolute Leucocyte Count Neutrophils"], category: "hematology", loincCode: "751-8", normalUnit: "cells/µL", description: "Absolute neutrophil count" },
  { canonicalName: "Absolute Lymphocyte Count", aliases: ["ALC", "Abs Lymphocytes", "Absolute Lymphocytes", "Absolute Lymphocyte", "Absolute Leukocyte Count Lymphocytes", "Absolute Leucocyte Count Lymphocytes"], category: "hematology", loincCode: "731-0", normalUnit: "cells/µL", description: "Absolute lymphocyte count" },
  { canonicalName: "Absolute Eosinophil Count", aliases: ["AEC", "Abs Eosinophils", "Absolute Eosinophils", "Absolute Eosinophil", "Absolute Leukocyte Count Eosinophils", "Absolute Leucocyte Count Eosinophils"], category: "hematology", loincCode: "711-2", normalUnit: "cells/µL", description: "Absolute eosinophil count" },
  { canonicalName: "Absolute Monocyte Count", aliases: ["AMC", "Abs Monocytes", "Absolute Monocytes", "Absolute Monocyte", "Absolute Leukocyte Count Monocytes", "Absolute Leucocyte Count Monocytes"], category: "hematology", loincCode: "742-7", normalUnit: "cells/µL", description: "Absolute monocyte count" },
  { canonicalName: "Absolute Basophil Count", aliases: ["ABC", "Abs Basophils", "Absolute Basophils", "Absolute Basophil", "Absolute Leukocyte Count Basophils", "Absolute Leucocyte Count Basophils"], category: "hematology", loincCode: "704-7", normalUnit: "cells/µL", description: "Absolute basophil count" },
  { canonicalName: "Neutrophil-Lymphocyte Ratio", aliases: ["NLR", "Neutrophil Lymphocyte Ratio", "Neutrophil/Lymphocyte Ratio", "Neutrophil lymphocyte ratio (NLR)"], category: "hematology", normalUnit: "ratio", description: "Ratio of neutrophils to lymphocytes" },
  { canonicalName: "Ferritin", aliases: ["Serum Ferritin"], category: "hematology", loincCode: "2276-4", normalUnit: "ng/mL", description: "Serum ferritin" },
  // Thyroid
  { canonicalName: "TSH", aliases: ["Thyroid Stimulating Hormone", "Ultra TSH", "TSH Ultrasensitive"], category: "thyroid", loincCode: "3016-3", normalUnit: "µIU/mL", description: "Thyroid stimulating hormone" },
  { canonicalName: "Free T4", aliases: ["FT4", "Free Thyroxine", "T4 Free"], category: "thyroid", loincCode: "3024-7", normalUnit: "ng/dL", description: "Free thyroxine" },
  { canonicalName: "Free T3", aliases: ["FT3", "Free Triiodothyronine", "T3 Free"], category: "thyroid", loincCode: "3051-0", normalUnit: "pg/mL", description: "Free triiodothyronine" },
  // Vitamin
  { canonicalName: "Vitamin D", aliases: ["25-OH Vitamin D", "Vitamin D3", "25 Hydroxy Vitamin D", "Vit D", "25(OH)D"], category: "vitamin", loincCode: "62292-8", normalUnit: "ng/mL", description: "25-hydroxy vitamin D" },
  { canonicalName: "Vitamin B12", aliases: ["B12", "Cobalamin", "Vit B12"], category: "vitamin", loincCode: "2132-9", normalUnit: "pg/mL", description: "Vitamin B12" },
  { canonicalName: "Folate", aliases: ["Folic Acid", "Serum Folate"], category: "vitamin", loincCode: "2284-8", normalUnit: "ng/mL", description: "Serum folate" },
  // Other chemistry
  { canonicalName: "Amylase", aliases: ["Serum Amylase", "Amylase Serum"], category: "other", loincCode: "1798-8", normalUnit: "U/L", description: "Serum amylase" },
  { canonicalName: "Lipase", aliases: ["Serum Lipase", "Lipase Serum"], category: "other", loincCode: "3040-3", normalUnit: "U/L", description: "Serum lipase" },
  // Body
  { canonicalName: "Weight", aliases: ["Body Weight", "Wt"], category: "body", loincCode: "29463-7", normalUnit: "kg", description: "Body weight" },
  { canonicalName: "Height", aliases: ["Body Height", "Ht"], category: "body", loincCode: "8302-2", normalUnit: "cm", description: "Body height" },
  { canonicalName: "BMI", aliases: ["Body Mass Index"], category: "body", loincCode: "39156-5", normalUnit: "kg/m²", description: "Body mass index" },
  { canonicalName: "Waist Circumference", aliases: ["Waist"], category: "body", loincCode: "8280-0", normalUnit: "cm", description: "Waist circumference" },
  // Cardiovascular
  { canonicalName: "Blood Pressure Systolic", aliases: ["Systolic BP", "SBP", "BP Systolic"], category: "cardiovascular", loincCode: "8480-6", normalUnit: "mmHg", description: "Systolic blood pressure" },
  { canonicalName: "Blood Pressure Diastolic", aliases: ["Diastolic BP", "DBP", "BP Diastolic"], category: "cardiovascular", loincCode: "8462-4", normalUnit: "mmHg", description: "Diastolic blood pressure" },
  { canonicalName: "Resting Heart Rate", aliases: ["RHR", "Pulse", "Heart Rate"], category: "cardiovascular", loincCode: "40443-4", normalUnit: "bpm", description: "Resting heart rate" },
  { canonicalName: "HRV", aliases: ["Heart Rate Variability", "SDNN"], category: "cardiovascular", loincCode: "80404-7", normalUnit: "ms", description: "Heart rate variability" },
  { canonicalName: "VO2 Max", aliases: ["VO2max", "Cardio Fitness"], category: "cardiovascular", normalUnit: "mL/kg/min", description: "Maximal oxygen uptake" },
  // Activity / Sleep
  { canonicalName: "Steps", aliases: ["Step Count", "Daily Steps"], category: "activity", loincCode: "55423-8", normalUnit: "steps", description: "Daily step count" },
  { canonicalName: "Sleep Duration", aliases: ["Sleep Time", "Total Sleep"], category: "sleep", normalUnit: "hours", description: "Sleep duration" },
];
