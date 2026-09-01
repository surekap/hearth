CREATE TABLE IF NOT EXISTS "clinical_images" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "profile_id" uuid NOT NULL REFERENCES "profiles"("id") ON DELETE cascade,
  "document_id" uuid NOT NULL REFERENCES "documents"("id") ON DELETE cascade,
  "extraction_job_id" uuid NOT NULL REFERENCES "extraction_jobs"("id") ON DELETE cascade,
  "status" text DEFAULT 'draft' NOT NULL,
  "asset_kind" text NOT NULL,
  "comparison_key" text NOT NULL,
  "study_name" text,
  "modality" text,
  "body_part" text,
  "laterality" text,
  "view" text,
  "report_date" date,
  "source_page" integer,
  "page_label" text,
  "storage_key" text NOT NULL,
  "sha256_hash" text NOT NULL,
  "mime_type" text NOT NULL,
  "width" integer,
  "height" integer,
  "metadata_json" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "clinical_images_profile_comparison_idx"
  ON "clinical_images" ("profile_id", "comparison_key");
CREATE INDEX IF NOT EXISTS "clinical_images_document_idx"
  ON "clinical_images" ("document_id");
CREATE INDEX IF NOT EXISTS "clinical_images_job_idx"
  ON "clinical_images" ("extraction_job_id");
CREATE UNIQUE INDEX IF NOT EXISTS "clinical_images_job_page_key_idx"
  ON "clinical_images" ("extraction_job_id", "source_page", "comparison_key");
