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

export const sexEnum = pgEnum("sex_at_birth", ["male", "female", "other", "unknown"]);

export const documentTypeEnum = pgEnum("document_type", [
  "lab_report",
  "prescription",
  "imaging",
  "specialist_report",
  "discharge_summary",
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
    valueNumeric: doublePrecision("value_numeric"),
    valueText: text("value_text"),
    unit: text("unit"),
    referenceLow: doublePrecision("reference_low"),
    referenceHigh: doublePrecision("reference_high"),
    interpretation: interpretationEnum("interpretation").notNull().default("unknown"),
    source: observationSourceEnum("source").notNull().default("document"),
    confidence: doublePrecision("confidence"),
    status: observationStatusEnum("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("observations_profile_idx").on(t.profileId),
    index("observations_profile_type_idx").on(t.profileId, t.observationTypeId),
    index("observations_profile_status_idx").on(t.profileId, t.status),
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
