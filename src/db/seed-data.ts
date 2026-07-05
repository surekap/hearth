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
    | "allergy"
    | "autoimmune"
    | "coagulation"
    | "hormone"
    | "infectious"
    | "mineral"
    | "urine"
    | "cardiac"
    | "tumor_marker"
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
  { canonicalName: "Globulin", aliases: ["Serum Globulin"], category: "liver", normalUnit: "g/dL", description: "Serum globulin" },
  { canonicalName: "Albumin/Globulin Ratio", aliases: ["A/G Ratio", "AG Ratio", "Albumin Globulin Ratio"], category: "liver", normalUnit: "ratio", description: "Albumin to globulin ratio" },
  { canonicalName: "Indirect Bilirubin", aliases: ["Bilirubin Indirect", "Bilirubin (Indirect/Unconjugated)", "Unconjugated Bilirubin"], category: "liver", normalUnit: "mg/dL", description: "Indirect (unconjugated) bilirubin" },
  // Lipid
  { canonicalName: "Total Cholesterol", aliases: ["Cholesterol", "Serum Cholesterol", "Cholesterol Total"], category: "lipid", loincCode: "2093-3", normalUnit: "mg/dL", description: "Total cholesterol" },
  { canonicalName: "Triglycerides", aliases: ["TG", "Serum Triglycerides", "Trigs"], category: "lipid", loincCode: "2571-8", normalUnit: "mg/dL", description: "Triglycerides" },
  { canonicalName: "HDL", aliases: ["HDL Cholesterol", "HDL-C", "High Density Lipoprotein"], category: "lipid", loincCode: "2085-9", normalUnit: "mg/dL", description: "HDL cholesterol" },
  { canonicalName: "LDL", aliases: ["LDL Cholesterol", "LDL-C", "Low Density Lipoprotein", "LDL (Calculated)"], category: "lipid", loincCode: "13457-7", normalUnit: "mg/dL", description: "LDL cholesterol" },
  { canonicalName: "VLDL", aliases: ["VLDL Cholesterol", "Very Low Density Lipoprotein"], category: "lipid", loincCode: "13458-5", normalUnit: "mg/dL", description: "VLDL cholesterol" },
  { canonicalName: "Non-HDL Cholesterol", aliases: ["Non HDL", "Non-HDL-C"], category: "lipid", loincCode: "43396-1", normalUnit: "mg/dL", description: "Non-HDL cholesterol" },
  { canonicalName: "Total Cholesterol/HDL Ratio", aliases: ["C/HDL Ratio", "Cholesterol HDL Ratio", "Total Cholesterol HDL Ratio"], category: "lipid", normalUnit: "ratio", description: "Total cholesterol to HDL cholesterol ratio" },
  // Glucose
  { canonicalName: "HbA1c", aliases: ["Glycated Hemoglobin", "Glycosylated Hemoglobin", "A1c", "Hemoglobin A1c", "HBA1C"], category: "glucose", loincCode: "4548-4", normalUnit: "%", description: "Glycated hemoglobin, 3-month glucose average" },
  { canonicalName: "Fasting Glucose", aliases: ["FBS", "Fasting Blood Sugar", "Glucose Fasting", "Fasting Plasma Glucose", "FPG", "Blood Sugar Fasting"], category: "glucose", loincCode: "1558-6", normalUnit: "mg/dL", description: "Fasting blood glucose" },
  { canonicalName: "Postprandial Glucose", aliases: ["PPBS", "Post Prandial Blood Sugar", "Glucose PP", "PP Glucose", "2hr Glucose"], category: "glucose", loincCode: "1521-4", normalUnit: "mg/dL", description: "Post-prandial blood glucose" },
  { canonicalName: "Random Glucose", aliases: ["RBS", "Random Blood Sugar", "Glucose Random"], category: "glucose", loincCode: "2345-7", normalUnit: "mg/dL", description: "Random blood glucose" },
  { canonicalName: "Fasting Insulin", aliases: ["Insulin Fasting", "Serum Insulin"], category: "glucose", loincCode: "3701-0", normalUnit: "µIU/mL", description: "Fasting serum insulin" },
  { canonicalName: "Postprandial Insulin", aliases: ["Insulin Post Prandial", "S. Insulin (Post Prandial)", "Post Prandial Insulin"], category: "glucose", normalUnit: "µIU/mL", description: "Post-prandial serum insulin" },
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
  { canonicalName: "RDW-CV", aliases: ["RDW", "R.D.W", "RDW CV", "Red Cell Distribution Width", "Red Cell Distribution Width CV"], category: "hematology", loincCode: "788-0", normalUnit: "%", description: "Red cell distribution width coefficient of variation" },
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
  { canonicalName: "Total T3", aliases: ["T3", "Thyroid (T3)", "Total Triiodothyronine", "Triiodothyronine Total"], category: "thyroid", normalUnit: "ng/dL", description: "Total triiodothyronine" },
  { canonicalName: "Total T4", aliases: ["T4", "Thyroid (T4)", "Thyroxine Total", "Total Thyroxine"], category: "thyroid", normalUnit: "µg/dL", description: "Total thyroxine" },
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

  // Minerals / Electrolytes / Iron studies
  { canonicalName: "Calcium", aliases: ["Serum Calcium", "Ca", "Total Calcium"], category: "mineral", normalUnit: "mg/dL", description: "Total serum calcium" },
  { canonicalName: "Ionized Calcium", aliases: ["Free Calcium", "Ca Ionized"], category: "mineral", normalUnit: "mmol/L", description: "Ionized calcium" },
  { canonicalName: "Magnesium", aliases: ["Serum Magnesium", "Mg"], category: "mineral", normalUnit: "mg/dL", description: "Serum magnesium" },
  { canonicalName: "Phosphorus", aliases: ["Phosphate", "Serum Phosphorus", "Serum Phosphate"], category: "mineral", normalUnit: "mg/dL", description: "Serum phosphorus/phosphate" },
  { canonicalName: "Chloride", aliases: ["Serum Chloride", "Cl", "Cl-"], category: "mineral", normalUnit: "mmol/L", description: "Serum chloride" },
  { canonicalName: "Bicarbonate", aliases: ["HCO3", "CO2", "Total CO2", "Serum Bicarbonate"], category: "mineral", normalUnit: "mmol/L", description: "Serum bicarbonate / total carbon dioxide" },
  { canonicalName: "Iron", aliases: ["Serum Iron"], category: "mineral", normalUnit: "µg/dL", description: "Serum iron" },
  { canonicalName: "TIBC", aliases: ["Total Iron Binding Capacity"], category: "mineral", normalUnit: "µg/dL", description: "Total iron binding capacity" },
  { canonicalName: "UIBC", aliases: ["Unsaturated Iron Binding Capacity"], category: "mineral", normalUnit: "µg/dL", description: "Unsaturated iron binding capacity" },
  { canonicalName: "Transferrin Saturation", aliases: ["TSAT", "Iron Saturation", "% Transferrin Saturation"], category: "mineral", normalUnit: "%", description: "Percentage saturation of transferrin with iron" },
  { canonicalName: "Transferrin", aliases: ["Serum Transferrin"], category: "mineral", normalUnit: "mg/dL", description: "Serum transferrin" },
  { canonicalName: "Zinc", aliases: ["Serum Zinc", "Zn"], category: "mineral", normalUnit: "µg/dL", description: "Serum zinc" },
  { canonicalName: "Copper", aliases: ["Serum Copper", "Cu"], category: "mineral", normalUnit: "µg/dL", description: "Serum copper" },
  { canonicalName: "Ceruloplasmin", aliases: ["Caeruloplasmin"], category: "mineral", normalUnit: "mg/dL", description: "Ceruloplasmin" },
  { canonicalName: "Selenium", aliases: ["Serum Selenium", "Se"], category: "mineral", normalUnit: "µg/L", description: "Serum selenium" },

  // Additional vitamins
  { canonicalName: "Vitamin A", aliases: ["Retinol", "Vit A"], category: "vitamin", normalUnit: "µg/dL", description: "Vitamin A / retinol" },
  { canonicalName: "Vitamin B1", aliases: ["Thiamine", "Thiamin", "Vit B1"], category: "vitamin", normalUnit: "nmol/L", description: "Vitamin B1 / thiamine" },
  { canonicalName: "Vitamin B2", aliases: ["Riboflavin", "Vit B2"], category: "vitamin", normalUnit: "nmol/L", description: "Vitamin B2 / riboflavin" },
  { canonicalName: "Vitamin B3", aliases: ["Niacin", "Nicotinic Acid", "Vit B3"], category: "vitamin", normalUnit: "µg/mL", description: "Vitamin B3 / niacin" },
  { canonicalName: "Vitamin B5", aliases: ["Pantothenic Acid", "Vit B5"], category: "vitamin", normalUnit: "µg/mL", description: "Vitamin B5 / pantothenic acid" },
  { canonicalName: "Vitamin B6", aliases: ["Pyridoxine", "PLP", "Pyridoxal 5 Phosphate", "Vit B6"], category: "vitamin", normalUnit: "ng/mL", description: "Vitamin B6" },
  { canonicalName: "Biotin", aliases: ["Vitamin B7", "Vit B7"], category: "vitamin", normalUnit: "ng/L", description: "Vitamin B7 / biotin" },
  { canonicalName: "Vitamin C", aliases: ["Ascorbic Acid", "Vit C"], category: "vitamin", normalUnit: "mg/dL", description: "Vitamin C / ascorbic acid" },
  { canonicalName: "Vitamin E", aliases: ["Alpha Tocopherol", "Tocopherol", "Vit E"], category: "vitamin", normalUnit: "mg/L", description: "Vitamin E / alpha tocopherol" },
  { canonicalName: "Vitamin K", aliases: ["Phylloquinone", "Vit K", "Vitamin K1"], category: "vitamin", normalUnit: "ng/mL", description: "Vitamin K" },
  { canonicalName: "Holotranscobalamin", aliases: ["Active B12", "HoloTC", "Holo Transcobalamin"], category: "vitamin", normalUnit: "pmol/L", description: "Active vitamin B12 marker" },
  { canonicalName: "Methylmalonic Acid", aliases: ["MMA"], category: "vitamin", normalUnit: "nmol/L", description: "Functional marker of vitamin B12 status" },
  { canonicalName: "Homocysteine", aliases: ["Total Homocysteine"], category: "vitamin", normalUnit: "µmol/L", description: "Marker affected by B12, folate, and B6 status" },

  // Allergy / Immunology
  { canonicalName: "Total IgE", aliases: ["IgE Total", "Total Immunoglobulin E", "Serum IgE"], category: "allergy", normalUnit: "IU/mL", description: "Total immunoglobulin E" },
  { canonicalName: "Eosinophil Cationic Protein", aliases: ["ECP"], category: "allergy", normalUnit: "µg/L", description: "Marker sometimes used in allergic inflammation" },
  { canonicalName: "Milk IgE", aliases: ["Cow Milk IgE", "Milk Specific IgE", "F2 Milk"], category: "allergy", normalUnit: "kUA/L", description: "Specific IgE to milk" },
  { canonicalName: "Egg White IgE", aliases: ["Egg White Specific IgE", "F1 Egg White"], category: "allergy", normalUnit: "kUA/L", description: "Specific IgE to egg white" },
  { canonicalName: "Egg Yolk IgE", aliases: ["Egg Yolk Specific IgE"], category: "allergy", normalUnit: "kUA/L", description: "Specific IgE to egg yolk" },
  { canonicalName: "Peanut IgE", aliases: ["Peanut Specific IgE", "F13 Peanut"], category: "allergy", normalUnit: "kUA/L", description: "Specific IgE to peanut" },
  { canonicalName: "Wheat IgE", aliases: ["Wheat Specific IgE", "F4 Wheat"], category: "allergy", normalUnit: "kUA/L", description: "Specific IgE to wheat" },
  { canonicalName: "Soybean IgE", aliases: ["Soy IgE", "Soybean Specific IgE", "F14 Soybean"], category: "allergy", normalUnit: "kUA/L", description: "Specific IgE to soybean" },
  { canonicalName: "Shrimp IgE", aliases: ["Prawn IgE", "Shrimp Specific IgE"], category: "allergy", normalUnit: "kUA/L", description: "Specific IgE to shrimp/prawn" },
  { canonicalName: "Fish IgE", aliases: ["Fish Specific IgE", "Codfish IgE"], category: "allergy", normalUnit: "kUA/L", description: "Specific IgE to fish" },
  { canonicalName: "Almond IgE", aliases: ["Almond Specific IgE"], category: "allergy", normalUnit: "kUA/L", description: "Specific IgE to almond" },
  { canonicalName: "Cashew IgE", aliases: ["Cashew Specific IgE"], category: "allergy", normalUnit: "kUA/L", description: "Specific IgE to cashew" },
  { canonicalName: "Walnut IgE", aliases: ["Walnut Specific IgE"], category: "allergy", normalUnit: "kUA/L", description: "Specific IgE to walnut" },
  { canonicalName: "Dust Mite D. pteronyssinus IgE", aliases: ["D1 IgE", "Dermatophagoides pteronyssinus IgE", "House Dust Mite DP IgE"], category: "allergy", normalUnit: "kUA/L", description: "Specific IgE to house dust mite D. pteronyssinus" },
  { canonicalName: "Dust Mite D. farinae IgE", aliases: ["D2 IgE", "Dermatophagoides farinae IgE", "House Dust Mite DF IgE"], category: "allergy", normalUnit: "kUA/L", description: "Specific IgE to house dust mite D. farinae" },
  { canonicalName: "Cat Dander IgE", aliases: ["Cat Epithelium IgE", "Cat Specific IgE", "E1 Cat Dander"], category: "allergy", normalUnit: "kUA/L", description: "Specific IgE to cat dander" },
  { canonicalName: "Dog Dander IgE", aliases: ["Dog Epithelium IgE", "Dog Specific IgE", "E5 Dog Dander"], category: "allergy", normalUnit: "kUA/L", description: "Specific IgE to dog dander" },
  { canonicalName: "Cockroach IgE", aliases: ["Cockroach Specific IgE", "I6 Cockroach"], category: "allergy", normalUnit: "kUA/L", description: "Specific IgE to cockroach" },
  { canonicalName: "Alternaria IgE", aliases: ["Alternaria alternata IgE", "M6 Alternaria"], category: "allergy", normalUnit: "kUA/L", description: "Specific IgE to Alternaria mold" },
  { canonicalName: "Aspergillus fumigatus IgE", aliases: ["Aspergillus IgE", "M3 Aspergillus fumigatus"], category: "allergy", normalUnit: "kUA/L", description: "Specific IgE to Aspergillus fumigatus" },
  { canonicalName: "Bermuda Grass IgE", aliases: ["Bermuda Grass Specific IgE", "G2 Bermuda Grass"], category: "allergy", normalUnit: "kUA/L", description: "Specific IgE to Bermuda grass" },
  { canonicalName: "Timothy Grass IgE", aliases: ["Timothy Grass Specific IgE", "G6 Timothy Grass"], category: "allergy", normalUnit: "kUA/L", description: "Specific IgE to Timothy grass" },
  { canonicalName: "Latex IgE", aliases: ["Latex Specific IgE", "K82 Latex"], category: "allergy", normalUnit: "kUA/L", description: "Specific IgE to latex" },

  // Hormones / Fertility / Adrenal
  { canonicalName: "Testosterone", aliases: ["Total Testosterone", "Testosterone Total", "Serum Testosterone"], category: "hormone", normalUnit: "ng/dL", description: "Total testosterone" },
  { canonicalName: "Free Testosterone", aliases: ["Testosterone Free"], category: "hormone", normalUnit: "pg/mL", description: "Free testosterone" },
  { canonicalName: "SHBG", aliases: ["Sex Hormone Binding Globulin"], category: "hormone", normalUnit: "nmol/L", description: "Sex hormone-binding globulin" },
  { canonicalName: "Estradiol", aliases: ["E2", "Oestradiol"], category: "hormone", normalUnit: "pg/mL", description: "Estradiol" },
  { canonicalName: "Progesterone", aliases: ["Serum Progesterone"], category: "hormone", normalUnit: "ng/mL", description: "Progesterone" },
  { canonicalName: "LH", aliases: ["Luteinizing Hormone"], category: "hormone", normalUnit: "mIU/mL", description: "Luteinizing hormone" },
  { canonicalName: "FSH", aliases: ["Follicle Stimulating Hormone"], category: "hormone", normalUnit: "mIU/mL", description: "Follicle-stimulating hormone" },
  { canonicalName: "Prolactin", aliases: ["PRL", "Serum Prolactin"], category: "hormone", normalUnit: "ng/mL", description: "Prolactin" },
  { canonicalName: "AMH", aliases: ["Anti Mullerian Hormone", "Anti-Mullerian Hormone"], category: "hormone", normalUnit: "ng/mL", description: "Anti-Mullerian hormone" },
  { canonicalName: "DHEA-S", aliases: ["DHEAS", "Dehydroepiandrosterone Sulfate"], category: "hormone", normalUnit: "µg/dL", description: "DHEA sulfate" },
  { canonicalName: "Cortisol", aliases: ["Serum Cortisol", "Morning Cortisol", "AM Cortisol"], category: "hormone", normalUnit: "µg/dL", description: "Cortisol" },
  { canonicalName: "ACTH", aliases: ["Adrenocorticotropic Hormone"], category: "hormone", normalUnit: "pg/mL", description: "Adrenocorticotropic hormone" },
  { canonicalName: "PTH", aliases: ["Parathyroid Hormone", "Intact PTH"], category: "hormone", normalUnit: "pg/mL", description: "Parathyroid hormone" },
  { canonicalName: "IGF-1", aliases: ["Insulin Like Growth Factor 1", "Somatomedin C"], category: "hormone", normalUnit: "ng/mL", description: "Insulin-like growth factor 1" },
  { canonicalName: "Beta hCG", aliases: ["β-hCG", "Human Chorionic Gonadotropin", "BHCG"], category: "hormone", normalUnit: "mIU/mL", description: "Beta human chorionic gonadotropin" },

  // Autoimmune / Rheumatology
  { canonicalName: "ANA", aliases: ["Antinuclear Antibody", "ANA by IFA", "ANA Screen"], category: "autoimmune", normalUnit: "titer", description: "Antinuclear antibody" },
  { canonicalName: "Anti-dsDNA", aliases: ["dsDNA Antibody", "Double Stranded DNA Antibody"], category: "autoimmune", normalUnit: "IU/mL", description: "Anti-double stranded DNA antibody" },
  { canonicalName: "Rheumatoid Factor", aliases: ["RF", "RA Factor"], category: "autoimmune", normalUnit: "IU/mL", description: "Rheumatoid factor" },
  { canonicalName: "Anti-CCP", aliases: ["CCP Antibody", "Cyclic Citrullinated Peptide Antibody"], category: "autoimmune", normalUnit: "U/mL", description: "Anti-cyclic citrullinated peptide antibody" },
  { canonicalName: "Anti-TPO", aliases: ["TPO Antibody", "Thyroid Peroxidase Antibody", "Microsomal Antibody"], category: "autoimmune", normalUnit: "IU/mL", description: "Thyroid peroxidase antibody" },
  { canonicalName: "Anti-Thyroglobulin", aliases: ["TgAb", "Thyroglobulin Antibody", "Anti Tg"], category: "autoimmune", normalUnit: "IU/mL", description: "Thyroglobulin antibody" },
  { canonicalName: "tTG IgA", aliases: ["Tissue Transglutaminase IgA", "Anti tTG IgA", "Celiac IgA"], category: "autoimmune", normalUnit: "U/mL", description: "Tissue transglutaminase IgA antibody" },
  { canonicalName: "Deamidated Gliadin Peptide IgG", aliases: ["DGP IgG", "Gliadin IgG"], category: "autoimmune", normalUnit: "U/mL", description: "Deamidated gliadin peptide IgG antibody" },
  { canonicalName: "ENA Screen", aliases: ["Extractable Nuclear Antigen Screen"], category: "autoimmune", normalUnit: "", description: "Extractable nuclear antigen antibody screen" },
  { canonicalName: "Anti-Smith", aliases: ["Sm Antibody", "Anti Sm"], category: "autoimmune", normalUnit: "U/mL", description: "Smith antibody" },
  { canonicalName: "Anti-Ro", aliases: ["SSA Antibody", "Anti SSA", "Ro Antibody"], category: "autoimmune", normalUnit: "U/mL", description: "Anti-Ro/SSA antibody" },
  { canonicalName: "Anti-La", aliases: ["SSB Antibody", "Anti SSB", "La Antibody"], category: "autoimmune", normalUnit: "U/mL", description: "Anti-La/SSB antibody" },
  { canonicalName: "C3 Complement", aliases: ["Complement C3"], category: "autoimmune", normalUnit: "mg/dL", description: "Complement component C3" },
  { canonicalName: "C4 Complement", aliases: ["Complement C4"], category: "autoimmune", normalUnit: "mg/dL", description: "Complement component C4" },
  { canonicalName: "HLA-B27", aliases: ["HLA B27"], category: "autoimmune", normalUnit: "", description: "HLA-B27 genetic marker" },

  // Coagulation
  { canonicalName: "Prothrombin Time", aliases: ["PT", "P.Time", "Coagulation - P.Time (Plasma)", "Prothrombin Time Plasma"], category: "coagulation", normalUnit: "seconds", description: "Prothrombin time" },
  { canonicalName: "INR", aliases: ["International Normalized Ratio", "PT INR"], category: "coagulation", normalUnit: "ratio", description: "International normalized ratio" },
  { canonicalName: "aPTT", aliases: ["APTT", "Activated Partial Thromboplastin Time", "PTT"], category: "coagulation", normalUnit: "seconds", description: "Activated partial thromboplastin time" },
  { canonicalName: "D-Dimer", aliases: ["D Dimer", "D-dimer"], category: "coagulation", normalUnit: "ng/mL FEU", description: "Fibrin degradation product" },
  { canonicalName: "Fibrinogen", aliases: ["Factor I"], category: "coagulation", normalUnit: "mg/dL", description: "Fibrinogen" },

  // Urine / Kidney damage markers
  { canonicalName: "Urine Albumin", aliases: ["Microalbumin", "Urine Microalbumin", "Albumin Urine"], category: "urine", normalUnit: "mg/L", description: "Urinary albumin" },
  { canonicalName: "Urine Albumin Creatinine Ratio", aliases: ["UACR", "ACR", "Microalbumin Creatinine Ratio", "Albumin Creatinine Ratio"], category: "urine", normalUnit: "mg/g", description: "Urine albumin-to-creatinine ratio" },
  { canonicalName: "Urine Protein", aliases: ["Protein Urine", "Urinary Protein"], category: "urine", normalUnit: "mg/dL", description: "Urine protein" },
  { canonicalName: "Urine Protein Creatinine Ratio", aliases: ["UPCR", "Protein Creatinine Ratio"], category: "urine", normalUnit: "mg/g", description: "Urine protein-to-creatinine ratio" },
  { canonicalName: "Urine Creatinine", aliases: ["Creatinine Urine", "Urinary Creatinine"], category: "urine", normalUnit: "mg/dL", description: "Urine creatinine" },
  { canonicalName: "Urine Specific Gravity", aliases: ["Specific Gravity", "USG"], category: "urine", normalUnit: "", description: "Urine specific gravity" },
  { canonicalName: "Urine pH", aliases: ["pH Urine"], category: "urine", normalUnit: "", description: "Urine pH" },
  { canonicalName: "Urine Glucose", aliases: ["Glucose Urine", "Sugar Urine"], category: "urine", normalUnit: "mg/dL", description: "Urine glucose" },
  { canonicalName: "Urine Ketones", aliases: ["Ketones Urine", "Ketone Bodies Urine"], category: "urine", normalUnit: "mg/dL", description: "Urine ketones" },
  { canonicalName: "Urine Nitrite", aliases: ["Nitrite Urine"], category: "urine", normalUnit: "", description: "Urine nitrite" },
  { canonicalName: "Urine Leukocyte Esterase", aliases: ["Leukocyte Esterase", "LE Urine"], category: "urine", normalUnit: "", description: "Urine leukocyte esterase" },
  { canonicalName: "Urine Red Blood Cells", aliases: ["Urine RBC", "RBC Urine", "Red Blood Cells", "Red Blood Cells Urine"], category: "urine", normalUnit: "/HPF", description: "Red blood cells in urine microscopy" },
  { canonicalName: "Urine Pus Cells", aliases: ["Pus Cells", "Urine WBC", "WBC Urine", "White Blood Cells Urine"], category: "urine", normalUnit: "/HPF", description: "White blood cells/pus cells in urine microscopy" },
  { canonicalName: "Urine Epithelial Cells", aliases: ["Epithelial Cells"], category: "urine", normalUnit: "/HPF", description: "Epithelial cells in urine microscopy" },
  { canonicalName: "Urine Bacteria", aliases: ["Bacteria"], category: "urine", normalUnit: "", description: "Bacteria in urine microscopy" },
  { canonicalName: "Urine Bile Salts", aliases: ["Bile Salts"], category: "urine", normalUnit: "", description: "Bile salts in urine" },
  { canonicalName: "Urine Bilirubin", aliases: ["Bilirubin"], category: "urine", normalUnit: "", description: "Bilirubin in urine" },
  { canonicalName: "Urine Crystals", aliases: ["Crystals"], category: "urine", normalUnit: "", description: "Crystals in urine microscopy" },
  { canonicalName: "Urine Granular Casts", aliases: ["Granular Casts"], category: "urine", normalUnit: "/LPF", description: "Granular casts in urine microscopy" },
  { canonicalName: "Urine Hyaline Casts", aliases: ["Hyaline Casts"], category: "urine", normalUnit: "/LPF", description: "Hyaline casts in urine microscopy" },
  { canonicalName: "Urine Non-Squamous Epithelial Cells", aliases: ["Non Squamous Epithelial Cells"], category: "urine", normalUnit: "/HPF", description: "Non-squamous epithelial cells in urine microscopy" },
  { canonicalName: "Urine Renal Tubular Epithelial Cells", aliases: ["Renal Tubular Epithelial Cells"], category: "urine", normalUnit: "/HPF", description: "Renal tubular epithelial cells in urine microscopy" },
  { canonicalName: "Urine Urobilinogen", aliases: ["Urobilinogen"], category: "urine", normalUnit: "", description: "Urobilinogen in urine" },
  { canonicalName: "Urine Yeast", aliases: ["Yeast"], category: "urine", normalUnit: "", description: "Yeast in urine microscopy" },

  // Infectious disease screening
  { canonicalName: "HBsAg", aliases: ["Hepatitis B Surface Antigen", "HBV Surface Antigen"], category: "infectious", normalUnit: "", description: "Hepatitis B surface antigen" },
  { canonicalName: "Anti-HBs", aliases: ["HBsAb", "Hepatitis B Surface Antibody"], category: "infectious", normalUnit: "mIU/mL", description: "Hepatitis B surface antibody" },
  { canonicalName: "Anti-HBc Total", aliases: ["HBcAb Total", "Hepatitis B Core Antibody Total"], category: "infectious", normalUnit: "", description: "Total hepatitis B core antibody" },
  { canonicalName: "HCV Antibody", aliases: ["Anti-HCV", "Anti HCV", "Hepatitis C Antibody"], category: "infectious", normalUnit: "", description: "Hepatitis C antibody" },
  { canonicalName: "HIV 1/2 Antibody", aliases: ["Anti HIV I & II", "Anti HIV I and II", "HIV 1/2 Ab"], category: "infectious", normalUnit: "", description: "HIV 1/2 antibody screening test" },
  { canonicalName: "HIV 1/2 Ag/Ab", aliases: ["HIV Combo", "HIV DUO", "HIV 4th Generation", "HIV Ag Ab"], category: "infectious", normalUnit: "", description: "HIV antigen/antibody screening test" },
  { canonicalName: "VDRL", aliases: ["Syphilis VDRL"], category: "infectious", normalUnit: "", description: "Non-treponemal syphilis screening test" },
  { canonicalName: "Dengue NS1 Antigen", aliases: ["NS1 Antigen", "Dengue NS1"], category: "infectious", normalUnit: "", description: "Dengue NS1 antigen" },
  { canonicalName: "Dengue IgM", aliases: ["Dengue IgM Antibody"], category: "infectious", normalUnit: "", description: "Dengue IgM antibody" },
  { canonicalName: "Dengue IgG", aliases: ["Dengue IgG Antibody"], category: "infectious", normalUnit: "", description: "Dengue IgG antibody" },
  { canonicalName: "Malaria Antigen", aliases: ["Malarial Antigen", "MP Antigen", "Malaria Parasite Antigen"], category: "infectious", normalUnit: "", description: "Malaria antigen rapid test" },
  { canonicalName: "Widal O Antigen", aliases: ["Typhi O", "Salmonella Typhi O"], category: "infectious", normalUnit: "titer", description: "Widal O antigen titer" },
  { canonicalName: "Widal H Antigen", aliases: ["Typhi H", "Salmonella Typhi H"], category: "infectious", normalUnit: "titer", description: "Widal H antigen titer" },
  { canonicalName: "COVID-19 RT-PCR", aliases: ["SARS-CoV-2 RT-PCR", "COVID PCR", "Coronavirus RT PCR"], category: "infectious", normalUnit: "", description: "SARS-CoV-2 RT-PCR" },
  { canonicalName: "COVID-19 IgG", aliases: ["SARS-CoV-2 IgG", "COVID IgG"], category: "infectious", normalUnit: "AU/mL", description: "SARS-CoV-2 IgG antibody" },

  // Cardiac / Muscle injury
  { canonicalName: "Troponin I", aliases: ["cTnI", "Cardiac Troponin I"], category: "cardiac", normalUnit: "ng/L", description: "Cardiac troponin I" },
  { canonicalName: "Troponin T", aliases: ["cTnT", "Cardiac Troponin T", "High Sensitivity Troponin T", "hs-TnT"], category: "cardiac", normalUnit: "ng/L", description: "Cardiac troponin T" },
  { canonicalName: "CK-MB", aliases: ["Creatine Kinase MB", "CPK-MB"], category: "cardiac", normalUnit: "ng/mL", description: "Creatine kinase MB isoenzyme" },
  { canonicalName: "Creatine Kinase", aliases: ["CK", "CPK", "Creatine Phosphokinase"], category: "cardiac", normalUnit: "U/L", description: "Creatine kinase" },
  { canonicalName: "NT-proBNP", aliases: ["N-terminal proBNP", "NT pro BNP"], category: "cardiac", normalUnit: "pg/mL", description: "N-terminal pro B-type natriuretic peptide" },
  { canonicalName: "BNP", aliases: ["B-type Natriuretic Peptide", "Brain Natriuretic Peptide"], category: "cardiac", normalUnit: "pg/mL", description: "B-type natriuretic peptide" },

  // Tumor markers / screening markers
  { canonicalName: "PSA", aliases: ["Total PSA", "PSA Total", "Prostate Specific Antigen", "Prostate Specific Antigen (PSA)", "Prostate Specific Antigen Total"], category: "tumor_marker", normalUnit: "ng/mL", description: "Total prostate-specific antigen" },
  { canonicalName: "PSA Free", aliases: ["Free PSA", "Prostate Specific Antigen Free"], category: "tumor_marker", normalUnit: "ng/mL", description: "Free prostate-specific antigen" },
  { canonicalName: "CEA", aliases: ["Carcinoembryonic Antigen"], category: "tumor_marker", normalUnit: "ng/mL", description: "Carcinoembryonic antigen" },
  { canonicalName: "AFP", aliases: ["Alpha Fetoprotein", "Alpha-Fetoprotein"], category: "tumor_marker", normalUnit: "ng/mL", description: "Alpha-fetoprotein" },
  { canonicalName: "CA 125", aliases: ["CA-125", "Cancer Antigen 125"], category: "tumor_marker", normalUnit: "U/mL", description: "Cancer antigen 125" },
  { canonicalName: "CA 19-9", aliases: ["CA19-9", "Cancer Antigen 19-9"], category: "tumor_marker", normalUnit: "U/mL", description: "Cancer antigen 19-9" },
  { canonicalName: "CA 15-3", aliases: ["CA15-3", "Cancer Antigen 15-3"], category: "tumor_marker", normalUnit: "U/mL", description: "Cancer antigen 15-3" },
];
