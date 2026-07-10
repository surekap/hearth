import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  uuid,
  boolean,
  integer,
  doublePrecision,
  date,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// ---------- Enums ----------

export const relationshipEnum = pgEnum("relationship", [
  "self",
  "spouse",
  "child",
  "parent",
  "other",
]);

export const profileAccessRoleEnum = pgEnum("profile_access_role", ["manager", "member"]);

export const sexEnum = pgEnum("sex_at_birth", ["male", "female", "other", "unknown"]);

export const documentTypeEnum = pgEnum("document_type", [
  "lab_report",
  "prescription",
  "imaging",
  "specialist_report",
  "discharge_summary",
  "genetic_report",
  "invoice",
  "other",
]);

export const documentSourceEnum = pgEnum("document_source", [
  "apollo",
  "whatsapp",
  "camera",
  "files",
  "manual",
  "unknown",
]);

export const ocrStatusEnum = pgEnum("ocr_status", ["pending", "complete", "failed"]);

export const extractionStatusEnum = pgEnum("extraction_status", [
  "pending",
  "draft",
  "confirmed",
  "rejected",
  "failed",
]);

export const extractionJobStatusEnum = pgEnum("extraction_job_status", [
  "pending",
  "processing",
  "needs_review",
  "accepted",
  "rejected",
  "failed",
]);

export const extractedItemTypeEnum = pgEnum("extracted_item_type", [
  "lab_observation",
  "medication",
  "diagnosis",
  "procedure",
  "report_summary",
  "genetic_variant",
  "genetic_risk",
  "genetic_trait",
  "pharmacogenomic_result",
]);

export const extractedItemStatusEnum = pgEnum("extracted_item_status", [
  "draft",
  "accepted",
  "rejected",
]);

export const observationCategoryEnum = pgEnum("observation_category", [
  "liver",
  "lipid",
  "glucose",
  "inflammation",
  "renal",
  "hematology",
  "thyroid",
  "vitamin",
  "body",
  "activity",
  "sleep",
  "cardiovascular",
  "respiratory",
  "nutrition",
  "mobility",
  "environment",
  "event",
  "allergy",
  "autoimmune",
  "coagulation",
  "hormone",
  "infectious",
  "mineral",
  "urine",
  "cardiac",
  "tumor_marker",
  "other",
]);

export const interpretationEnum = pgEnum("interpretation", [
  "low",
  "normal",
  "high",
  "critical",
  "unknown",
]);

export const observationSourceEnum = pgEnum("observation_source", [
  "document",
  "apple_health",
  "manual",
  "imported",
]);

export const observationStatusEnum = pgEnum("observation_status", [
  "draft",
  "confirmed",
  "rejected",
]);

export const observationAggregationEnum = pgEnum("observation_aggregation", [
  "instant",
  "interval",
  "daily_sum",
  "daily_avg",
  "session_avg",
  "min",
  "max",
  "derived",
]);

export const healthImportSourceSystemEnum = pgEnum("health_import_source_system", [
  "apple_health",
  "health_connect",
  "device_api",
  "manual_csv",
  "document_extraction",
  "other",
]);

export const healthImportStatusEnum = pgEnum("health_import_status", [
  "pending",
  "processing",
  "complete",
  "failed",
]);

export const healthRollupPeriodEnum = pgEnum("health_rollup_period", [
  "day",
  "week",
  "month",
]);

export const medicationFormEnum = pgEnum("medication_form", [
  "tablet",
  "capsule",
  "injection",
  "syrup",
  "topical",
  "inhaler",
  "other",
]);

export const medicationEventTypeEnum = pgEnum("medication_event_type", [
  "prescribed",
  "started",
  "stopped",
  "intake_logged",
  "skipped",
  "dose_changed",
]);

export const clinicalReportTypeEnum = pgEnum("clinical_report_type", [
  "imaging",
  "specialist",
  "discharge",
  "procedure",
  "other",
]);

export const geneticTestKindEnum = pgEnum("genetic_test_kind", [
  "predisposition",
  "pharmacogenomics",
  "carrier",
  "raw_genotype",
  "other",
]);

export const geneticRiskLevelEnum = pgEnum("genetic_risk_level", [
  "low",
  "normal",
  "medium",
  "high",
  "unknown",
]);

export const pharmacogenomicActionabilityEnum = pgEnum("pharmacogenomic_actionability", [
  "informational",
  "actionable",
  "high_impact",
  "unknown",
]);

// ---------- Tables ----------

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  // Bearer token for the iOS Shortcut upload API (Phase 1.5).
  apiToken: text("api_token").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
});

export const profiles = pgTable(
  "profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    relationship: relationshipEnum("relationship").notNull().default("self"),
    dateOfBirth: date("date_of_birth"),
    sexAtBirth: sexEnum("sex_at_birth").notNull().default("unknown"),
    bloodGroup: text("blood_group"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("profiles_user_idx").on(t.userId)]
);

export const profileAccounts = pgTable(
  "profile_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: profileAccessRoleEnum("role").notNull().default("member"),
    invitedByUserId: uuid("invited_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("profile_accounts_user_idx").on(t.userId),
    index("profile_accounts_profile_idx").on(t.profileId),
    uniqueIndex("profile_accounts_profile_user_idx").on(t.profileId, t.userId),
  ]
);

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    uploadedByUserId: uuid("uploaded_by_user_id")
      .notNull()
      .references(() => users.id),
    documentType: documentTypeEnum("document_type").notNull().default("other"),
    source: documentSourceEnum("source").notNull().default("unknown"),
    originalFilename: text("original_filename").notNull(),
    mimeType: text("mime_type").notNull(),
    storageKey: text("storage_key").notNull(),
    sha256Hash: text("sha256_hash").notNull(),
    documentDate: date("document_date"),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
    encrypted: boolean("encrypted").notNull().default(true),
    ocrStatus: ocrStatusEnum("ocr_status").notNull().default("pending"),
    extractionStatus: extractionStatusEnum("extraction_status").notNull().default("pending"),
  },
  (t) => [
    index("documents_profile_idx").on(t.profileId),
    uniqueIndex("documents_profile_hash_idx").on(t.profileId, t.sha256Hash),
  ]
);

export const documentText = pgTable("document_text", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  rawText: text("raw_text").notNull(),
  ocrEngine: text("ocr_engine").notNull(),
  confidence: doublePrecision("confidence"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const extractionJobs = pgTable(
  "extraction_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    status: extractionJobStatusEnum("status").notNull().default("pending"),
    modelUsed: text("model_used"),
    promptVersion: text("prompt_version"),
    piiRedacted: boolean("pii_redacted").notNull().default(false),
    inputTokenCount: integer("input_token_count"),
    outputTokenCount: integer("output_token_count"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    error: text("error"),
  },
  (t) => [index("extraction_jobs_document_idx").on(t.documentId)]
);

export const extractedItems = pgTable(
  "extracted_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    extractionJobId: uuid("extraction_job_id")
      .notNull()
      .references(() => extractionJobs.id, { onDelete: "cascade" }),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    itemType: extractedItemTypeEnum("item_type").notNull(),
    status: extractedItemStatusEnum("status").notNull().default("draft"),
    rawJson: jsonb("raw_json").notNull(),
    confidence: doublePrecision("confidence"),
    userCorrected: boolean("user_corrected").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  },
  (t) => [index("extracted_items_job_idx").on(t.extractionJobId)]
);

export const healthImports = pgTable(
  "health_imports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    sourceSystem: healthImportSourceSystemEnum("source_system").notNull(),
    sourceFormat: text("source_format").notNull(),
    originalFilename: text("original_filename"),
    sha256Hash: text("sha256_hash"),
    externalExportDate: timestamp("external_export_date", { withTimezone: true }),
    status: healthImportStatusEnum("status").notNull().default("pending"),
    summaryJson: jsonb("summary_json"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("health_imports_profile_idx").on(t.profileId),
    uniqueIndex("health_imports_profile_hash_idx").on(t.profileId, t.sha256Hash),
  ]
);

export const healthSyncState = pgTable(
  "health_sync_state",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    sourceSystem: healthImportSourceSystemEnum("source_system").notNull(),
    externalType: text("external_type").notNull(),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    lastAnchor: text("last_anchor"),
    status: healthImportStatusEnum("status").notNull().default("pending"),
    error: text("error"),
  },
  (t) => [
    index("health_sync_state_profile_idx").on(t.profileId),
    uniqueIndex("health_sync_state_profile_type_idx").on(
      t.profileId,
      t.sourceSystem,
      t.externalType
    ),
  ]
);

export const observationTypes = pgTable("observation_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  canonicalName: text("canonical_name").notNull().unique(),
  aliases: text("aliases").array().notNull().default([]),
  category: observationCategoryEnum("category").notNull().default("other"),
  loincCode: text("loinc_code"),
  ucumUnit: text("ucum_unit"),
  normalUnit: text("normal_unit"),
  description: text("description"),
});

export const observations = pgTable(
  "observations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    documentId: uuid("document_id").references(() => documents.id, {
      onDelete: "set null",
    }),
    observationTypeId: uuid("observation_type_id")
      .notNull()
      .references(() => observationTypes.id),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    startAt: timestamp("start_at", { withTimezone: true }),
    endAt: timestamp("end_at", { withTimezone: true }),
    valueNumeric: doublePrecision("value_numeric"),
    valueText: text("value_text"),
    unit: text("unit"),
    referenceLow: doublePrecision("reference_low"),
    referenceHigh: doublePrecision("reference_high"),
    interpretation: interpretationEnum("interpretation").notNull().default("unknown"),
    source: observationSourceEnum("source").notNull().default("document"),
    aggregation: observationAggregationEnum("aggregation").notNull().default("instant"),
    externalSourceType: text("external_source_type"),
    externalSourceId: text("external_source_id"),
    sourceName: text("source_name"),
    deviceName: text("device_name"),
    metadataJson: jsonb("metadata_json"),
    rawImportId: uuid("raw_import_id").references(() => healthImports.id, {
      onDelete: "set null",
    }),
    confidence: doublePrecision("confidence"),
    status: observationStatusEnum("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("observations_profile_idx").on(t.profileId),
    index("observations_profile_type_idx").on(t.profileId, t.observationTypeId),
    index("observations_profile_status_idx").on(t.profileId, t.status),
    index("observations_profile_time_idx").on(t.profileId, t.observedAt),
    index("observations_import_idx").on(t.rawImportId),
    uniqueIndex("observations_profile_external_idx").on(
      t.profileId,
      t.externalSourceType,
      t.externalSourceId
    ),
  ]
);

export const healthEvents = pgTable(
  "health_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    importId: uuid("import_id").references(() => healthImports.id, { onDelete: "set null" }),
    eventType: text("event_type").notNull(),
    label: text("label").notNull(),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }),
    source: observationSourceEnum("source").notNull().default("imported"),
    sourceName: text("source_name"),
    deviceName: text("device_name"),
    metadataJson: jsonb("metadata_json"),
    externalSourceType: text("external_source_type"),
    externalSourceId: text("external_source_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("health_events_profile_idx").on(t.profileId),
    index("health_events_profile_time_idx").on(t.profileId, t.startAt),
    index("health_events_import_idx").on(t.importId),
    uniqueIndex("health_events_profile_external_idx").on(
      t.profileId,
      t.externalSourceType,
      t.externalSourceId
    ),
  ]
);

export const healthRollups = pgTable(
  "health_rollups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    importId: uuid("import_id").references(() => healthImports.id, { onDelete: "set null" }),
    period: healthRollupPeriodEnum("period").notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    observationTypeId: uuid("observation_type_id")
      .notNull()
      .references(() => observationTypes.id),
    valueNumeric: doublePrecision("value_numeric").notNull(),
    unit: text("unit"),
    aggregation: observationAggregationEnum("aggregation").notNull(),
    sourceObservationCount: integer("source_observation_count").notNull().default(0),
    metadataJson: jsonb("metadata_json"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("health_rollups_profile_idx").on(t.profileId),
    index("health_rollups_profile_period_idx").on(t.profileId, t.period, t.periodStart),
    index("health_rollups_import_idx").on(t.importId),
    uniqueIndex("health_rollups_profile_metric_period_idx").on(
      t.profileId,
      t.period,
      t.periodStart,
      t.observationTypeId,
      t.aggregation
    ),
  ]
);

export const clinicalReports = pgTable(
  "clinical_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    reportType: clinicalReportTypeEnum("report_type").notNull().default("other"),
    specialty: text("specialty"),
    reportDate: date("report_date"),
    facility: text("facility"),
    doctorName: text("doctor_name"),
    summary: text("summary"),
    findingsJson: jsonb("findings_json"),
    impression: text("impression"),
    followUpRecommended: boolean("follow_up_recommended").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("clinical_reports_profile_idx").on(t.profileId)]
);

export const geneticReports = pgTable(
  "genetic_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    vendor: text("vendor"),
    reportName: text("report_name"),
    reportDate: date("report_date"),
    testKind: geneticTestKindEnum("test_kind").notNull().default("other"),
    genomeBuild: text("genome_build"),
    summary: text("summary"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("genetic_reports_profile_idx").on(t.profileId),
    uniqueIndex("genetic_reports_profile_document_idx").on(t.profileId, t.documentId),
  ]
);

export const geneticVariants = pgTable(
  "genetic_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    geneticReportId: uuid("genetic_report_id")
      .notNull()
      .references(() => geneticReports.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    gene: text("gene"),
    variantId: text("variant_id"),
    marker: text("marker"),
    chromosome: text("chromosome"),
    position: text("position"),
    genotype: text("genotype"),
    phenotype: text("phenotype"),
    sourceSection: text("source_section"),
    metadataJson: jsonb("metadata_json"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("genetic_variants_profile_idx").on(t.profileId),
    index("genetic_variants_report_idx").on(t.geneticReportId),
  ]
);

export const geneticRiskAssessments = pgTable(
  "genetic_risk_assessments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    geneticReportId: uuid("genetic_report_id")
      .notNull()
      .references(() => geneticReports.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    category: text("category").notNull().default("disease"),
    conditionName: text("condition_name").notNull(),
    assessment: text("assessment"),
    riskLevel: geneticRiskLevelEnum("risk_level").notNull().default("unknown"),
    lifetimeRiskPercent: doublePrecision("lifetime_risk_percent"),
    populationRiskPercent: doublePrecision("population_risk_percent"),
    variantScore: text("variant_score"),
    summary: text("summary"),
    metadataJson: jsonb("metadata_json"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("genetic_risks_profile_idx").on(t.profileId),
    index("genetic_risks_report_idx").on(t.geneticReportId),
  ]
);

export const pharmacogenomicResults = pgTable(
  "pharmacogenomic_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    geneticReportId: uuid("genetic_report_id")
      .notNull()
      .references(() => geneticReports.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    drugName: text("drug_name").notNull(),
    gene: text("gene"),
    genotype: text("genotype"),
    phenotype: text("phenotype"),
    implication: text("implication").notNull(),
    actionability: pharmacogenomicActionabilityEnum("actionability")
      .notNull()
      .default("unknown"),
    recommendationSummary: text("recommendation_summary"),
    evidenceLevel: text("evidence_level"),
    metadataJson: jsonb("metadata_json"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("pgx_results_profile_idx").on(t.profileId),
    index("pgx_results_report_idx").on(t.geneticReportId),
  ]
);

export const geneticReannotations = pgTable(
  "genetic_reannotations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    geneticReportId: uuid("genetic_report_id")
      .notNull()
      .references(() => geneticReports.id, { onDelete: "cascade" }),
    sourceName: text("source_name").notNull(),
    sourceUrl: text("source_url"),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
    classification: text("classification"),
    notes: text("notes"),
    metadataJson: jsonb("metadata_json"),
  },
  (t) => [
    index("genetic_reannotations_profile_idx").on(t.profileId),
    index("genetic_reannotations_report_idx").on(t.geneticReportId),
  ]
);

export const medicationMaster = pgTable("medication_master", {
  id: uuid("id").primaryKey().defaultRandom(),
  genericName: text("generic_name"),
  brandName: text("brand_name"),
  manufacturer: text("manufacturer"),
  form: medicationFormEnum("form").notNull().default("other"),
  strength: text("strength"),
  source: text("source").notNull().default("manual"), // manual | prescription | imported
  country: text("country").notNull().default("IN"),
  aliases: text("aliases").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const medicationEvents = pgTable(
  "medication_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    medicationMasterId: uuid("medication_master_id").references(() => medicationMaster.id),
    nameText: text("name_text").notNull(),
    dose: text("dose"),
    route: text("route"),
    frequency: text("frequency"),
    courseStartDate: date("course_start_date"),
    courseEndDate: date("course_end_date"),
    courseDurationText: text("course_duration_text"),
    eventType: medicationEventTypeEnum("event_type").notNull().default("intake_logged"),
    eventTime: timestamp("event_time", { withTimezone: true }).notNull().defaultNow(),
    documentId: uuid("document_id").references(() => documents.id, { onDelete: "set null" }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("medication_events_profile_idx").on(t.profileId),
    index("medication_events_profile_time_idx").on(t.profileId, t.eventTime),
  ]
);

export const recentMedications = pgTable(
  "recent_medications",
  {
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    medicationMasterId: uuid("medication_master_id").references(() => medicationMaster.id),
    nameText: text("name_text").notNull(),
    dose: text("dose"),
    frequency: text("frequency"),
    courseStartDate: date("course_start_date"),
    courseEndDate: date("course_end_date"),
    courseDurationText: text("course_duration_text"),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }).notNull().defaultNow(),
    useCount: integer("use_count").notNull().default(1),
  },
  (t) => [uniqueIndex("recent_medications_profile_name_idx").on(t.profileId, t.nameText)]
);

export const aiContextLogs = pgTable(
  "ai_context_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    question: text("question").notNull(),
    contextJson: jsonb("context_json").notNull(),
    redactionVersion: text("redaction_version").notNull(),
    model: text("model").notNull(),
    answer: text("answer"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ai_context_logs_profile_idx").on(t.profileId)]
);

export const insightToneEnum = pgEnum("insight_tone", [
  "encouraging",
  "neutral",
  "warning",
  "stern",
]);

/**
 * Pre-computed, profile-scoped insights shown on the Ask AI tab without the
 * user asking. Regenerated when confirmed data changes (fingerprinted), so
 * the reasoning cost is paid once per data change, not per view.
 */
export const aiInsights = pgTable(
  "ai_insights",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    tone: insightToneEnum("tone").notNull().default("neutral"),
    category: text("category"),
    model: text("model").notNull(),
    dataFingerprint: text("data_fingerprint").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ai_insights_profile_idx").on(t.profileId)]
);

export const datapointKindEnum = pgEnum("datapoint_kind", [
  "symptom",
  "mood",
  "sleep",
  "lifestyle",
  "medication_mention",
  "other",
]);

export const datapointSeverityEnum = pgEnum("datapoint_severity", [
  "mild",
  "moderate",
  "severe",
]);

/**
 * Patient-reported data points captured from AI conversations (symptoms,
 * mood, sleep, lifestyle). Unverified by documents — kept separate from
 * observations, but fed back into future AI context.
 */
export const conversationDatapoints = pgTable(
  "conversation_datapoints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    aiContextLogId: uuid("ai_context_log_id").references(() => aiContextLogs.id, {
      onDelete: "set null",
    }),
    kind: datapointKindEnum("kind").notNull().default("other"),
    label: text("label").notNull(),
    detail: text("detail"),
    severity: datapointSeverityEnum("severity"),
    notedAt: timestamp("noted_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("conversation_datapoints_profile_idx").on(t.profileId)]
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id),
    profileId: uuid("profile_id").references(() => profiles.id, { onDelete: "set null" }),
    action: text("action").notNull(), // upload | view_document | export | ai_ask | accept_extraction | ...
    targetType: text("target_type"),
    targetId: text("target_id"),
    detail: jsonb("detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_logs_user_idx").on(t.userId)]
);
