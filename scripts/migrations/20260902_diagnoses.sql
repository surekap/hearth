-- Diagnoses/conditions (SPEC §5.5, FHIR Condition).
--
-- `diagnosis` already existed in extracted_item_type but had no destination
-- table, so accepting one silently discarded it. This adds the table the accept
-- route now writes to.
--
-- Enum values are added outside the transaction below because PostgreSQL cannot
-- use a new enum value in the same transaction that created it.

CREATE TYPE diagnosis_category AS ENUM (
  'cardiovascular',
  'metabolic',
  'hepatic',
  'renal',
  'respiratory',
  'endocrine',
  'musculoskeletal',
  'neurological',
  'gastrointestinal',
  'hematological',
  'immune',
  'infectious',
  'oncological',
  'psychiatric',
  'dermatological',
  'reproductive',
  'ophthalmic',
  'other'
);

CREATE TYPE diagnosis_clinical_status AS ENUM (
  'active',
  'recurrence',
  'remission',
  'resolved',
  'inactive',
  'unknown'
);

CREATE TYPE diagnosis_certainty AS ENUM (
  'confirmed',
  'probable',
  'suspected',
  'ruled_out',
  'unknown'
);

BEGIN;

CREATE TABLE IF NOT EXISTS diagnoses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  document_id uuid REFERENCES documents (id) ON DELETE CASCADE,
  clinical_report_id uuid REFERENCES clinical_reports (id) ON DELETE SET NULL,
  condition_name text NOT NULL,
  normalized_name text NOT NULL,
  category diagnosis_category NOT NULL DEFAULT 'other',
  clinical_status diagnosis_clinical_status NOT NULL DEFAULT 'unknown',
  certainty diagnosis_certainty NOT NULL DEFAULT 'unknown',
  severity text,
  body_site text,
  icd10_code text,
  onset_date date,
  recorded_date date,
  resolved_date date,
  doctor_name text,
  note text,
  page_number integer,
  confidence double precision,
  metadata_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS diagnoses_profile_idx ON diagnoses (profile_id);
CREATE INDEX IF NOT EXISTS diagnoses_document_idx ON diagnoses (document_id);
CREATE INDEX IF NOT EXISTS diagnoses_profile_status_idx
  ON diagnoses (profile_id, clinical_status);

-- Backs the ON CONFLICT upsert in the extraction accept route, so re-accepting a
-- document updates its conditions instead of duplicating them.
CREATE UNIQUE INDEX IF NOT EXISTS diagnoses_profile_document_name_key
  ON diagnoses (profile_id, document_id, normalized_name);

COMMIT;
