BEGIN;

ALTER TYPE extracted_item_type ADD VALUE IF NOT EXISTS 'diagnostic_measurement';

ALTER TABLE extraction_jobs
  ADD COLUMN IF NOT EXISTS warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS uncertain_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS coverage_json jsonb;

ALTER TABLE clinical_reports
  ADD COLUMN IF NOT EXISTS study_name text,
  ADD COLUMN IF NOT EXISTS modality text,
  ADD COLUMN IF NOT EXISTS body_part text,
  ADD COLUMN IF NOT EXISTS page_start integer,
  ADD COLUMN IF NOT EXISTS page_end integer;

CREATE INDEX IF NOT EXISTS clinical_reports_document_idx
  ON clinical_reports (document_id);

COMMIT;
