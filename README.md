# Hearth — Family Health Record PWA

Private, family-oriented health records: upload medical PDFs/images per family profile,
extract lab values with an LLM into reviewable drafts, confirm them into a structured
Postgres model, and explore trends, timelines and profile-scoped AI Q&A.

Built from [SPEC.md](./SPEC.md) — all of Phase 1 (Milestones 1–7) plus the Phase 1.5
iPhone ingestion workaround: upload → extract → review → confirm → timeline → dashboard →
AI Q&A, medication logging, and JSON / FHIR / doctor-friendly PDF export.

## Stack

- **Next.js 16** (App Router, Turbopack) · TypeScript · Tailwind 4 · shadcn/ui · Recharts
- **Postgres** via Drizzle ORM (`pg` Pool — works with local, self-hosted, or managed Postgres)
- **Auth.js v5** credentials (email/password, JWT sessions), route protection via `src/proxy.ts`
- **Documents**: AES-256-GCM encrypted before storage; Vercel Blob when
  `BLOB_READ_WRITE_TOKEN` is set, local `./storage` dir otherwise
- **Extraction**: OpenAI Responses API (PDF/image input, strict JSON schema) when
  `OPENAI_API_KEY` is set; deterministic **mock provider** otherwise so the whole flow
  works offline
- **AI layer**: profile-isolated context builder → PII redaction (v1) → answer, with
  `ai_context_logs` recording the exact context packet used. Three tiers:
  1. **Rules engine** — trend/latest/abnormal questions are computed straight from
     confirmed observations (no model call at all)
  2. **Reasoning model** — everything else, with keyword-matched raw-report snippets
     added when structured data may not cover the question
  3. **Pre-computed insights** — a physician-voiced briefing (encouraging when things
     are good, stern when they're not; never prescribes) generated once per data change
     (fingerprinted) and always visible on the Ask tab
  Patient-reported details mentioned in conversation (symptoms, mood, sleep) are
  extracted into `conversation_datapoints` and fed back into future context.
  Models are per-task: `EXTRACTION_MODEL` (cheap, high-volume) and `REASONING_MODEL`
  (capable), both defaulting to `OPENAI_MODEL`.

## Local development

Prereqs: Node 20+, Postgres running locally.

```bash
npm install

# .env.local was generated with dev secrets; adjust DATABASE_URL if needed
npm run db:push     # create tables
npm run db:seed     # observation types + user (surekap@gmail.com / hearth-dev)

npm run dev         # http://localhost:3000
```

Sign in with the seeded account (`SEED_USER_EMAIL` / `SEED_USER_PASSWORD` in `.env.local`,
default `surekap@gmail.com` / `hearth-dev`).

A sample Apollo-style lab PDF lives at `fixtures/apollo-sample-lab-report.pdf` for testing
the upload flow.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string (local or Neon) |
| `AUTH_SECRET` | Auth.js JWT secret (`openssl rand -base64 32`) |
| `DOCUMENT_ENCRYPTION_KEY` | 32-byte hex master key for AES-256-GCM (`openssl rand -hex 32`) |
| `OPENAI_API_KEY` | Enables real extraction + AI Q&A (otherwise mock provider) |
| `OPENAI_MODEL` | Optional, defaults to `gpt-4o` |
| `BLOB_READ_WRITE_TOKEN` | Enables Vercel Blob storage (otherwise local `./storage`) |
| `EXTRACTION_PROVIDER` | Set to `mock` to force the mock provider even with a key |
| `CRON_SECRET` | Bearer secret used by Vercel Cron to drain queued/stale extraction jobs |
| `SEED_USER_EMAIL/PASSWORD/NAME` | Seed account, used by `npm run db:seed` |

## Docker Compose (Hetzner / self-hosted)

The repo now ships with a `docker-compose.yml` that starts:

- the Hearth app
- a local Postgres 17 container
- a persistent Docker volume for Postgres data
- a bind mount at `/mnt/storagebox/hearth/storage` for encrypted uploaded documents

Bring it up with:

```bash
docker compose up -d --build
```

On first boot the app container will:

1. wait for Postgres
2. run `npm run db:push`
3. run `npm run db:seed`
4. start the production Next.js server

Default local URL: `http://localhost:3000`

Default seeded login:

- Email: `admin@hearth.local`
- Password: `hearth-dev`

Important overrides for a real server:

- Set `NEXT_PUBLIC_APP_URL` to your public HTTPS URL
- Set strong values for `AUTH_SECRET`, `DOCUMENT_ENCRYPTION_KEY`, and `CRON_SECRET`
- Optionally set `OPENAI_API_KEY` if you want real extraction/Q&A instead of the mock provider

By default Docker Compose uses local disk storage at `/app/storage`, so no Blob/Neon
dependency is required. In the provided compose file, `/app/storage` is backed by
`${HEARTH_STORAGE_DIR:-/mnt/storagebox/hearth/storage}` so uploads live on your
Hetzner Storage Box mount by default.

## Deploying to Vercel

1. Create a Vercel project and link this repo (`vercel link`).
2. Provision **Neon Postgres** and **Vercel Blob** from the Vercel Marketplace/Storage tab —
   this injects `DATABASE_URL` and `BLOB_READ_WRITE_TOKEN`.
3. Add `AUTH_SECRET`, `DOCUMENT_ENCRYPTION_KEY`, `OPENAI_API_KEY`, and `CRON_SECRET` as env vars.
4. Run the schema push + seed once against the Neon URL:
   `DATABASE_URL=postgres://…neon… npm run db:push && DATABASE_URL=… npm run db:seed`
5. `vercel deploy --prod`.

Keep `DOCUMENT_ENCRYPTION_KEY` safe — encrypted documents are unreadable without it.

## Architecture notes

- **Profile isolation is non-negotiable**: every clinical query filters by `profile_id`,
  every API route calls `requireProfile(userId, profileId)`, and the AI context builder
  selects data *before* anything reaches the model. Verified: a second profile sees zero
  of the first profile's data.
- **Drafts are never trusted**: extraction produces `extracted_items` (drafts). Confirmed
  `observations` rows are only written when the user accepts rows on the review screen.
  Dashboards and AI Q&A read `status = 'confirmed'` only.
- **Storage never sees plaintext**: files are AES-256-GCM encrypted server-side before
  `putObject`; the only decryption path is the authenticated
  `/api/documents/:id/file` endpoint (which audit-logs each view).
- **Audit trail**: uploads, views, extractions, accepts/rejects and AI questions land in
  `audit_logs`; the exact AI context packet + redaction version lands in `ai_context_logs`.

## Key directories

```
src/db/            schema (users, profiles, documents, extraction_jobs,
                   extracted_items, observations, observation_types,
                   clinical_reports, ai_context_logs, audit_logs), seed
src/lib/           auth, crypto (AES-GCM), storage (Blob/disk)
src/lib/health/    series logic, system registry, overview/system/metric loaders
src/lib/extraction openai + mock providers, canonical test mapping
src/lib/ai/        context builder, PII redaction, answer providers
src/app/api/       upload, process, review accept/reject, observations,
                   ai/ask, profiles
src/app/(app)/     timeline, dashboard (overview + per-system), metrics
                   (index + per-metric detail), documents, review, upload,
                   ask, profiles
```

## Medications (Milestone 6)

Accepted prescription extractions create `prescribed` medication events and appear as
one-tap loggable chips on the Meds page. Manual add grows an internal medication
dictionary (no third-party scraping) that powers autocomplete. Started/stopped/prescribed
events show as markers on the timeline and dashboard.

## Export (Milestone 7)

Per profile, from the Export page (all audit-logged, confirmed data only):

- **Doctor-friendly PDF** — cover summary, currently-abnormal values, medications,
  lab history by category, report impressions, document index (pdf-lib)
- **Internal JSON** — full raw bundle
- **FHIR bundle** — Patient / Observation / DiagnosticReport / DocumentReference /
  MedicationStatement, with lab Observations grouped under DiagnosticReport (ABDM-style)

## iPhone uploads (Phase 1.5)

Generate a bearer token on the Export page, then build an iOS Shortcut that POSTs the
shared file to `/api/documents/upload` with `Authorization: Bearer <token>` and a
`profileId` form field. Session-less uploads are validated, encrypted, deduped and
profile-isolated exactly like PWA uploads.

## Roadmap (from SPEC.md)

- **Phase 2**: native iOS shell with Share Extension + HealthKit sync
- **Phase 3**: Android share intent + Health Connect
