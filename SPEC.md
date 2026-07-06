# Personal Health Record PWA — Product & Technical Spec

## 1. Product thesis

Build a private, family-oriented health record system that starts with **lab report ingestion, genetic report context, and medical document storage**, then grows into Apple Health integration and cautious health intelligence.

The first version is **not a doctor replacement**. It is a structured personal health archive with timeline, dashboards, document provenance, and AI-assisted extraction.

## 2. Hard architecture decision

Start with:

```text
Next.js PWA on Vercel
Postgres database
Encrypted object storage for PDFs/images
Server-side OCR + LLM extraction
Profile-isolated health records
Manual review before accepting extracted data
```

Do **not** wait for native iOS. But also do **not** pretend the PWA can do everything.

HealthKit access and native iOS Share Extension require an iOS app later. Apple’s HealthKit is a native framework, not something a normal PWA can directly access. FHIR is the right export/interoperability model; lab values should map to `Observation`, reports to `DiagnosticReport`, and original documents to `DocumentReference`. ([nrces.in][1])

## 3. Phase plan

### Phase 1 — Core PWA

Build this first.

Features:

1. User login
2. Family profile switching
3. Upload PDFs/images
4. OCR + LLM extraction
5. Draft review screen
6. Confirmed lab values
7. Document timeline
8. Metabolic/liver dashboard
9. Basic AI Q&A over selected profile only
10. JSON + PDF export
11. Genetics page for confirmed pharmacogenomics, predisposition, traits, and variants

### Phase 1.5 — iPhone ingestion workaround

Use iOS Shortcuts:

```text
Share PDF/image from Apollo / WhatsApp / Files / Photos
→ Shortcut
→ POST file to upload API
→ Server queues extraction
→ Open PWA documents/review page when ready
```

This gives usable iPhone sharing before native app development.

### Phase 2 — Thin iOS shell

Build native iOS app with:

1. WebView for main UI
2. Native Share Extension
3. HealthKit read permissions
4. Background HealthKit sync
5. Push notifications/reminders later

### Phase 3 — Android

Add:

1. Android share intent
2. Health Connect import
3. Native wrapper around same PWA backend

## 4. First successful prototype

The first prototype is only successful if this flow works:

```text
Upload Apollo lab PDF
→ system extracts test values
→ user reviews and confirms
→ values appear in timeline
→ values appear in metabolic/liver dashboard
→ AI can answer questions using only that profile’s confirmed data
```

Everything else is secondary.

## 5. Core data model

### 5.1 Users

`users`

```text
id
email
name
password_hash / auth_provider_id
created_at
last_login_at
```

### 5.2 Profiles

Each person gets a separate profile.

`profiles`

```text
id
user_id
display_name
relationship: self | spouse | child | parent | other
date_of_birth
sex_at_birth
blood_group nullable
notes
created_at
```

All clinical data must be scoped by `profile_id`.

This is non-negotiable.

### 5.3 Documents

`documents`

```text
id
profile_id
uploaded_by_user_id
document_type: lab_report | prescription | imaging | specialist_report | discharge_summary | genetic_report | invoice | other
source: apollo | whatsapp | camera | files | manual | unknown
original_filename
mime_type
storage_key
sha256_hash
document_date nullable
uploaded_at
encrypted: boolean
ocr_status: pending | complete | failed
extraction_status: pending | draft | confirmed | rejected | failed
```

### 5.4 OCR text

`document_text`

```text
id
document_id
raw_text
ocr_engine
confidence
created_at
```

### 5.5 Extracted draft records

`extraction_jobs`

```text
id
document_id
profile_id
status: pending | processing | needs_review | accepted | rejected | failed
model_used
prompt_version
pii_redacted: boolean
input_token_count
output_token_count
created_at
completed_at
error
```

`extracted_items`

```text
id
extraction_job_id
profile_id
item_type: lab_observation | medication | diagnosis | procedure | report_summary | genetic_variant | genetic_risk | genetic_trait | pharmacogenomic_result
status: draft | accepted | rejected
raw_json
confidence
user_corrected: boolean
created_at
accepted_at
```

### 5.6 Observations

Atomic measurements go here. This table is the canonical measurement surface for
labs, vitals, wearable metrics, manual entries, and derived summaries. It should
stay source-agnostic: Apple Health, Health Connect, device APIs, CSV imports, and
document extraction all map into the same model.

`observations`

```text
id
profile_id
document_id nullable
observation_type_id
observed_at
start_at nullable
end_at nullable
value_numeric nullable
value_text nullable
unit nullable
reference_low nullable
reference_high nullable
interpretation: low | normal | high | critical | unknown
source: document | apple_health | manual | imported
aggregation: instant | interval | daily_sum | daily_avg | session_avg | min | max | derived
external_source_type nullable
external_source_id nullable
source_name nullable
device_name nullable
metadata_json nullable
raw_import_id nullable
confidence
status: draft | confirmed | rejected
created_at
updated_at
```

### 5.7 Observation types

`observation_types`

```text
id
canonical_name
aliases[]
category: liver | lipid | glucose | inflammation | renal | hematology | thyroid | vitamin | body | activity | sleep | cardiovascular | respiratory | nutrition | mobility | environment | event | other
loinc_code nullable
ucum_unit nullable
normal_unit nullable
description
```

Examples:

```text
ALT / SGPT
AST / SGOT
GGT
Triglycerides
HDL
LDL
HbA1c
Fasting glucose
Fasting insulin
CRP
Creatinine
Uric acid
Vitamin D
Weight
Resting heart rate
HRV
Sleep duration
Steps
VO2 max
Blood pressure systolic
Blood pressure diastolic
```

### 5.8 Health events

Not all useful health information is a numeric observation. Workouts, sleep
segments, high-heart-rate incidents, mindful sessions, symptoms, medication
periods, illness episodes, and future native integrations should land as
profile-scoped health events.

`health_events`

```text
id
profile_id
import_id nullable
event_type
label
start_at
end_at nullable
source: document | apple_health | manual | imported
source_name nullable
device_name nullable
metadata_json nullable
external_source_type nullable
external_source_id nullable
created_at
```

Examples:

```text
workout: Functional strength training
sleep_stage: Asleep REM
sleep_stage: Awake
high_heart_rate_event
mindful_session
illness_episode
medication_period
```

### 5.9 Imports and sync provenance

Every bulk import should have a batch record. This keeps dedupe, auditability,
rollback, and future reprocessing possible without tying the schema to Apple
Health.

`health_imports`

```text
id
profile_id
source_system: apple_health | health_connect | device_api | manual_csv | document_extraction | other
source_format
original_filename nullable
sha256_hash nullable
external_export_date nullable
status: pending | processing | complete | failed
summary_json nullable
error nullable
created_at
completed_at nullable
```

For native anchored sync, keep a generic cursor table:

`health_sync_state`

```text
id
profile_id
source_system
external_type
last_synced_at
last_anchor
status
error
```

### 5.10 Health rollups

Dashboards and AI context should not scan dense wearable samples. Use rollups for
daily/weekly/monthly summaries and import-derived aggregates.

`health_rollups`

```text
id
profile_id
import_id nullable
period: day | week | month
period_start
period_end
observation_type_id
value_numeric
unit nullable
aggregation: daily_sum | daily_avg | min | max | derived
source_observation_count
metadata_json nullable
created_at
```

Examples:

```text
Daily steps
Daily sleep duration
Daily REM/deep/core sleep duration
Daily average HRV
Daily resting heart rate
Weekly workout minutes
Monthly average weight
```

### 5.8 Reports

For specialist/imaging/non-standard reports.

`clinical_reports`

```text
id
profile_id
document_id
report_type: imaging | specialist | discharge | procedure | other
specialty nullable
report_date
facility nullable
doctor_name nullable
summary
findings_json
impression
follow_up_recommended boolean
created_at
```

### 5.9 Medications

`medication_master`

```text
id
generic_name
brand_name nullable
manufacturer nullable
form: tablet | capsule | injection | syrup | topical | inhaler | other
strength
source
country
aliases[]
```

`medication_events`

```text
id
profile_id
medication_master_id nullable
name_text
dose
route
frequency
event_type: prescribed | started | stopped | intake_logged | skipped | dose_changed
event_time
document_id nullable
notes
created_at
```

`recent_medications`

```text
profile_id
medication_master_id nullable
name_text
last_used_at
use_count
```

### 5.10 Genetics

Genetic reports are static evidence, not time-series lab values. They must stay
separate from `observations` so a disease predisposition is never mistaken for a
diagnosis or current measurement.

`genetic_reports`

```text
id
profile_id
document_id
vendor nullable
report_name nullable
report_date nullable
test_kind: predisposition | pharmacogenomics | carrier | raw_genotype | other
genome_build nullable
summary nullable
created_at
updated_at
```

`genetic_variants`

```text
id
profile_id
genetic_report_id
document_id
gene nullable
variant_id nullable
marker nullable
chromosome nullable
position nullable
genotype nullable
phenotype nullable
source_section nullable
metadata_json nullable
created_at
```

`genetic_risk_assessments`

```text
id
profile_id
genetic_report_id
document_id
category: disease | trait
condition_name
assessment nullable
risk_level: low | normal | medium | high | unknown
lifetime_risk_percent nullable
population_risk_percent nullable
variant_score nullable
summary nullable
metadata_json nullable
created_at
```

`pharmacogenomic_results`

```text
id
profile_id
genetic_report_id
document_id
drug_name
gene nullable
genotype nullable
phenotype nullable
implication
actionability: informational | actionable | high_impact | unknown
recommendation_summary nullable
evidence_level nullable
metadata_json nullable
created_at
```

`genetic_reannotations`

```text
id
profile_id
genetic_report_id
source_name
source_url nullable
checked_at
classification nullable
notes nullable
metadata_json nullable
```

## 6. Document ingestion flow

### Upload sources

Phase 1:

1. PWA file picker
2. Camera upload
3. Drag/drop desktop upload
4. iOS Shortcut upload API

Later:

1. Native iOS Share Extension
2. Android share intent
3. Email forwarding inbox

### Upload UX

User selects:

```text
Profile: Prateek / Nandita / Child / Parent
Document type: Auto-detect or manual
Source: Apollo / WhatsApp / Camera / Files / Other
Date: Auto-detected or manual
```

Then upload.

The upload UI must support selecting or dropping multiple files at once. Each
file is uploaded as its own request and shown with a per-file state: waiting,
uploading, queued for extraction, duplicate, or failed. The browser only owns
the binary upload step; once the server stores a file and creates an extraction
job, OCR/LLM processing must continue without the user keeping the upload page
focused.

### Processing pipeline

```text
File upload
→ virus scan / MIME validation
→ hash duplicate detection
→ encrypted storage
→ pending extraction_jobs row
→ upload response returns
→ background queue drain claims pending jobs
→ OCR
→ LLM extraction
→ draft records
→ review UI
→ user accepts / edits / rejects
→ confirmed records written to observations / reports / medications / genetics
```

Extraction is asynchronous and durable. `extraction_jobs` is the queue table:
`pending` means queued, `processing` means claimed by a worker/drain, `needs_review`
means draft rows are ready, and `failed` preserves the error for retry. The upload
route schedules a background drain after responding; manual retry uses the same
queue path and returns `202 Accepted` instead of blocking the request.

## 7. LLM extraction design

### Principle

LLM output is never trusted automatically.

It produces **drafts**, not medical truth.

### Lab extraction output schema

The LLM must return strict JSON:

```json
{
  "document_type": "lab_report",
  "patient_name": "REDACTED_OR_EXTRACTED_FOR_MATCHING_ONLY",
  "report_date": "2026-07-05",
  "lab_name": "Apollo Diagnostics",
  "observations": [
    {
      "test_name": "SGPT",
      "canonical_name": "ALT",
      "value": 67,
      "unit": "U/L",
      "reference_low": 0,
      "reference_high": 45,
      "interpretation": "high",
      "confidence": 0.94
    }
  ],
  "warnings": [],
  "uncertain_items": []
}
```

### Specialist/imaging report extraction

```json
{
  "document_type": "imaging",
  "report_date": "2026-07-05",
  "modality": "Ultrasound",
  "body_part": "Abdomen",
  "findings": [],
  "impression": "Fatty liver grade II",
  "follow_up_recommended": false,
  "confidence": 0.88
}
```

### Prescription extraction

```json
{
  "document_type": "prescription",
  "doctor_name": "string",
  "specialty": "string",
  "prescription_date": "date",
  "medications": [
    {
      "brand_name": "string",
      "generic_name": "string|null",
      "strength": "string",
      "dose": "string",
      "frequency": "string",
      "duration": "string",
      "confidence": 0.8
    }
  ]
}
```

### Genetic report extraction

```json
{
  "document_type": "genetic_report",
  "report_date": "2013-05-02",
  "genetic_report": {
    "vendor": "Mapmygenome",
    "report_name": "Genomepatri",
    "test_kind": "predisposition",
    "genome_build": null,
    "summary": "Predisposition, trait, and pharmacogenomic report.",
    "confidence": 0.92
  },
  "genetic_risks": [
    {
      "category": "disease",
      "condition_name": "Glaucoma",
      "assessment": "High risk",
      "risk_level": "high",
      "lifetime_risk_percent": 4.683,
      "population_risk_percent": 1.97,
      "variant_score": "4 out of 5",
      "summary": null,
      "confidence": 0.9
    }
  ],
  "pharmacogenomics": [
    {
      "drug_name": "Clopidogrel",
      "gene": "CYP2C19",
      "genotype": "*1/*2",
      "phenotype": "Intermediate metabolizer",
      "implication": "Therapy less effective",
      "actionability": "actionable",
      "recommendation_summary": "Discuss with the prescribing clinician before use.",
      "evidence_level": null,
      "confidence": 0.9
    }
  ],
  "genetic_variants": []
}
```

## 8. Review screen

This is one of the most important screens.

For each uploaded document:

```text
Original PDF/image preview on left
Extracted values on right
```

If extraction is still `pending` or `processing`, the review screen shows queue
status and a refresh action instead of requiring the upload page to remain open.

Each row:

```text
Test name | Value | Unit | Reference range | Date | Confidence | Accept/Edit/Reject
```

Genetic rows use the same draft workflow but render as:

```text
Medication/condition/trait/variant | Printed implication | Source report | Confidence | Accept/Reject
```

User actions:

1. Accept all high-confidence
2. Edit value/unit/date
3. Reject item
4. Change canonical mapping
5. Mark document type
6. Save confirmed records

Confirmed observations become trusted.

Draft observations and draft genetic findings must not appear in dashboards, AI
context, genetics pages, or exports unless explicitly toggled.

## 9. Profile isolation

Every query must include `profile_id`.

Bad approach:

```sql
SELECT * FROM observations WHERE user_id = ?
```

Correct approach:

```sql
SELECT * FROM observations
WHERE profile_id = ?
AND status = 'confirmed'
```

For AI context building, profile isolation must happen before retrieval.

No mixed-family context unless the user explicitly chooses a comparative family report.

## 10. AI Q&A

AI context should combine:

1. Confirmed clinical/lab observations
2. Recent and relevant health rollups
3. Meaningful health events
4. Medication events and document summaries
5. Confirmed genetic context: pharmacogenomics, risks, traits, and report provenance

Dense raw wearable samples must be summarized before they enter AI context.
Context builders should prefer source-agnostic concepts such as "daily sleep
duration" or "weekly workout minutes" instead of Apple-specific record names.

### Allowed

The AI can:

1. Summarize trends
2. Identify abnormal values
3. Correlate lab values with weight, sleep, HRV, medications
4. Suggest questions to ask a doctor
5. Explain what lab parameters generally mean
6. Flag missing follow-up data
7. Produce structured health summaries

### Not allowed

The AI should not:

1. Recommend starting/stopping medication
2. Diagnose conclusively
3. Override a doctor
4. Make emergency decisions
5. Use another profile’s data accidentally
6. Invent missing lab values
7. Treat genetic predisposition as diagnosis
8. Use pharmacogenomics to start, stop, switch, or dose medication

### AI answer style

Every answer should include:

```text
Data used
Time range
Confidence level
Possible confounders
Doctor discussion points
```

Example:

```text
Based on confirmed data from Prateek’s profile between Jan 2024 and Jul 2026, ALT rose alongside weight gain and triglycerides. This is correlation, not proof. Discuss liver enzymes, NAFLD monitoring, FibroScan timing, and medication effects with your physician.
```

## 11. AI context boundary

Before sending to LLM:

1. Select profile
2. Select relevant observations only
3. Remove PII
4. Remove names, phone numbers, addresses
5. Include document summaries, not raw PDFs by default
6. Include summarized genetic context, not raw variant dumps by default
7. Log the exact context packet

`ai_context_logs`

```text
id
profile_id
user_id
question
context_json
redaction_version
model
created_at
```

This is important. Without it, you will never know what the AI actually saw.

## 12. Dashboard: metabolic/liver

First dashboard should include:

### Core cards

1. Weight
2. ALT / SGPT
3. AST / SGOT
4. GGT
5. Triglycerides
6. HDL
7. LDL
8. HbA1c
9. Fasting glucose
10. CRP
11. Vitamin D
12. Uric acid

### Timeline overlays

Show vertical markers for:

1. Medication started/stopped
2. Major diagnosis
3. FibroScan
4. Imaging report
5. Prescription
6. Significant weight change

### Views

```text
3 months
6 months
1 year
3 years
All time
```

### Useful derived signals

1. ALT trend direction
2. AST/ALT ratio
3. Triglyceride/HDL ratio
4. HbA1c trend
5. Weight change versus ALT
6. Abnormal count over time

## 13. Medicine logging

### Flows

#### From prescription

After prescription extraction:

```text
Prescription found
→ medications listed
→ user accepts
→ each medicine appears as one-tap loggable
```

#### Manual add

```text
Search medicine
→ autocomplete
→ choose brand/generic
→ set dose/frequency
→ add to recent
```

#### Quick log

```text
Today
→ Recent meds
→ Tap medicine
→ Logged at current time
```

### Autocomplete source

For now, do not scrape 1mg/Apollo directly inside the app unless licensing/terms are clear.

Better prototype approach:

1. Start with manual entry + recent meds
2. Build internal medication dictionary over time
3. Later integrate a licensed medicine database or approved API

Be careful here. Scraping medicine sites can become fragile and legally messy.

## 14. General health data integration

Phase 1 PWA cannot directly read HealthKit, but it can import an Apple Health
export and map it into the generalized Hearth schema:

```text
Apple Health quantity record -> observation or health_rollup
Apple Health category record -> health_event and/or health_rollup
Apple Health workout -> health_event with workout statistics in metadata
Apple Health activity summary -> health_rollup
Apple Health export file -> health_imports
```

Phase 1 import priority:

1. Weight
2. Resting heart rate
3. HRV
4. Sleep duration
5. Steps
6. Workouts
7. Blood pressure
8. Blood glucose if available
9. VO₂ max
10. Medication logs if useful
11. Body composition
12. Respiratory rate / oxygen saturation
13. Mobility metrics such as walking speed, step length, and steadiness

Phase 2 native iOS app adds direct HealthKit read permissions and background
anchored sync, writing into the same `observations`, `health_events`,
`health_rollups`, and `health_sync_state` tables.

This keeps future Health Connect, Garmin, Oura, WHOOP, Ultrahuman, CSV, and
hospital export imports on the same path.

### Import policy

Avoid importing high-frequency samples directly into AI-facing timelines unless
the product needs raw detail. Prefer daily rollups for dense signals such as
heart rate, active energy, distance, walking metrics, and temperature. Keep raw
provenance and metadata in import batches and observation/event metadata so the
data can be reprocessed later.

## 15. Export

### JSON export

Support:

1. Internal JSON
2. FHIR-inspired JSON Bundle

FHIR mappings:

```text
Profile → Patient
Lab value → Observation
Lab report → DiagnosticReport
Original PDF/image → DocumentReference
Medication → MedicationStatement / MedicationRequest
Diagnosis → Condition
Procedure/imaging → Procedure / DiagnosticReport
Genetic risk / pharmacogenomics → Observation
```

ABDM’s FHIR implementation also groups lab results through `DiagnosticReport` referencing `Observation`, which matches your model well. ([nrces.in][1])

### PDF export

Per profile:

1. Cover summary
2. Current active conditions
3. Current/recent medications
4. Genetic and pharmacogenomic notes
5. Abnormal lab trends
6. Timeline
7. Attached document index
8. Selected lab tables

Doctor-friendly PDF matters more than raw FHIR for real-world Indian use.

## 16. Privacy and security

Chosen model: **B — cloud with encrypted documents and structured server-side data.**

### Minimum requirements

1. Encrypted object storage for documents
2. Database encryption at rest
3. Per-profile access scoping
4. Audit log for uploads, views, exports, AI calls
5. PII redaction before LLM calls
6. Signed URLs for document viewing
7. No public buckets
8. Rate limits on upload and AI endpoints
9. Strict MIME/type validation
10. Delete profile/export/delete document support

### Encryption design

Documents:

```text
PDF/image encrypted before storage or encrypted server-side with per-profile key envelope
```

Structured data:

```text
Stored in Postgres for analysis
Sensitive fields can be additionally encrypted if needed
```

Do not overbuild HIPAA-grade compliance now. But don’t be sloppy. This is family medical data.

## 17. Recommended stack

### Frontend

```text
Next.js App Router
TypeScript
Tailwind
shadcn/ui
React Query or TanStack Query
Recharts or Tremor for charts
PWA manifest
```

### Backend

```text
Next.js route handlers initially
Postgres
Prisma or Drizzle
Background jobs via Inngest / Trigger.dev / QStash
Object storage: S3-compatible / Vercel Blob / Cloudflare R2
OCR: Google Document AI / Azure OCR / Tesseract fallback
LLM: OpenAI / Anthropic structured JSON extraction
```

### Database

Use Postgres from day one.

Good options:

```text
Neon
Supabase Postgres
Railway Postgres
RDS Postgres
```

Given your general infra experience, I’d avoid Supabase magic unless you want speed. Neon + Prisma/Drizzle is clean.

## 18. API endpoints

```text
POST /api/documents/upload
  - accepts one file per request
  - returns 201 after encrypted storage and queue creation
GET  /api/documents
GET  /api/documents/:id
POST /api/documents/:id/process
  - queues/requeues extraction and returns 202
GET  /api/extractions/:id
POST /api/extractions/:id/accept
POST /api/extractions/:id/reject
PATCH /api/extracted-items/:id

GET  /api/profiles
POST /api/profiles
PATCH /api/profiles/:id

GET  /api/observations
POST /api/observations
PATCH /api/observations/:id
DELETE /api/observations/:id

GET  /api/dashboard/metabolic-liver

GET  /api/medications/recent
GET  /api/medications/search
POST /api/medications/log

POST /api/ai/ask

GET  /api/export/profile/:id/json
GET  /api/export/profile/:id/fhir
GET  /api/export/profile/:id/pdf
```

## 19. Key screens

### 1. Profile switcher

Top-level always-visible switch:

```text
Prateek | Nandita | Saira | Siya | Parent
```

### 2. Timeline

Chronological view:

```text
Jul 2026 — Lab report uploaded
Jun 2026 — Prescription
Jun 2026 — FibroScan
May 2026 — Weight entry
```

### 3. Upload

Simple:

```text
Choose profile
Upload PDF/image
Auto-detect document type
Process
```

### 4. Review extraction

Most important operational screen.

### 5. Lab values

Search/filter:

```text
ALT
HbA1c
LDL
Vitamin D
```

### 6. Metabolic/liver dashboard

The first “intelligence” screen.

### 7. Medications

Recent meds and prescription-derived meds.

### 8. Ask AI

Profile-scoped Q&A.

### 9. Export

JSON / FHIR JSON / PDF.

## 20. Development milestones

### Milestone 1

```text
Auth
Profiles
Upload document
Store encrypted file
Document list
```

### Milestone 2

```text
OCR
LLM extraction
Draft extracted items
Review/accept flow
```

### Milestone 3

```text
Observation model
Lab timeline
Manual edit
Canonical lab mapping
Generic health imports
Health events
Health rollups
Apple Health export import
```

### Milestone 4

```text
Metabolic/liver dashboard
Lifestyle/vitals rollups
Trend charts
Abnormal flags
```

### Milestone 5

```text
AI Q&A
Profile-scoped context builder
PII redaction
AI context audit logs
```

### Milestone 6

```text
Medication logging
Prescription extraction
Recent meds
```

### Milestone 7

```text
JSON export
FHIR-style export
Doctor-friendly PDF export
```

## 21. Where you are likely to fool yourself

The biggest trap is trying to build the whole vision immediately.

The second trap is pretending AI extraction is reliable enough without review.

The third trap is mixing profiles accidentally. That would destroy trust instantly.

The fourth trap is chasing Apple Health too early. It is useful, but your first unique value is **turning Apollo PDFs into structured longitudinal records**.

Build that first. Everything else hangs off it.

## 22. One-line engineering brief

Build a Next.js PWA personal health record system where users can upload medical PDFs/images per family profile, extract structured lab/report/prescription data via OCR + LLM into reviewable drafts, confirm values into a FHIR-inspired Postgres model, view metabolic/liver trends, log medications, ask profile-scoped AI questions with PII redaction and audit logs, and export profile data as JSON and doctor-friendly PDF.

[1]: https://nrces.in/ndhm/fhir/r4/StructureDefinition-Observation.html?utm_source=chatgpt.com "Observation - FHIR Implementation Guide for ABDM v6.5.0"
