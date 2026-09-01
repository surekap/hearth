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
- **Documents**: AES-256-GCM encrypted before storage; durable host filesystem in
  production and local `./storage` during development
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
| `DATABASE_URL` | Postgres connection string |
| `HEALTH_BRIDGE_DATABASE_HOST` | Tailnet-only PostgreSQL hostname shown to Health Bridge profiles |
| `HEALTH_BRIDGE_DATABASE_PORT` | Tailnet PostgreSQL port (defaults to `5432`) |
| `HEALTH_BRIDGE_DATABASE_NAME` | PostgreSQL database shown to Health Bridge profiles |
| `HEALTH_BRIDGE_DATABASE_SSLMODE` | Client TLS mode shown in generated URLs (defaults to `verify-full`) |
| `HEALTH_BRIDGE_TIMEZONE` | Local day boundary for raw sample aggregation (defaults to `Asia/Kolkata`) |
| `AUTH_SECRET` | Auth.js JWT secret (`openssl rand -base64 32`) |
| `DOCUMENT_ENCRYPTION_KEY` | 32-byte hex master key for AES-256-GCM (`openssl rand -hex 32`) |
| `OPENAI_API_KEY` | Enables real extraction + AI Q&A (otherwise mock provider) |
| `OPENAI_MODEL` | Optional, defaults to `gpt-4o` |
| `DOCUMENT_STORAGE_DIR` | Encrypted document storage path (defaults to `./storage`; `/app/storage` in Docker) |
| `EXTRACTION_PROVIDER` | Set to `mock` to force the mock provider even with a key |
| `CRON_SECRET` | Bearer secret for the extraction queue recovery endpoint |
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
- Set `POSTGRES_BIND_ADDRESS` to the host's Tailscale IP to allow Tailnet-only database access
- Set `POSTGRES_SSL=on` and `POSTGRES_TLS_DIR=/var/lib/hearth/postgres-tls` after installing the Tailscale certificate renewal service below
- Optionally set `OPENAI_API_KEY` if you want real extraction/Q&A instead of the mock provider

Docker Compose uses local disk storage at `/app/storage`. In the provided compose file,
`/app/storage` is backed by
`${HEARTH_STORAGE_DIR:-/mnt/storagebox/hearth/storage}` so uploads live on your
Hetzner Storage Box mount by default.

### Tailnet PostgreSQL TLS

Health Bridge and other clients that require publicly trusted TLS should connect
with the server's fully qualified Tailscale MagicDNS name. The certificate and
private key are generated only on the server and are never committed.

One-time installation on the Hetzner host:

```bash
cd /opt/hearth
sudo ./ops/hetzner/install-postgres-tls.sh hetzner-docker.tail95d995.ts.net
sudo sed -i '/^POSTGRES_SSL=/d; /^POSTGRES_TLS_DIR=/d' .env
sudo sed -i '$aPOSTGRES_SSL=on\nPOSTGRES_TLS_DIR=/var/lib/hearth/postgres-tls' .env
docker compose up -d postgres
```

The systemd timer checks daily and requests a new certificate only when the
current certificate has less than 30 days remaining. It validates the certificate
and key, installs them with PostgreSQL-compatible permissions, reloads PostgreSQL,
and verifies the live TLS endpoint.

```bash
systemctl status hearth-postgres-tls.timer
systemctl status hearth-postgres-tls.service
openssl s_client -starttls postgres \
  -connect 100.94.241.10:5432 \
  -servername hetzner-docker.tail95d995.ts.net </dev/null
```

## Production deployment

Production runs as Docker containers on the `hetzner-docker` SSH host. See
[DEPLOYMENT.md](./DEPLOYMENT.md) for initial setup, deployment, verification, backup,
and rollback instructions.

Keep `DOCUMENT_ENCRYPTION_KEY` safe and backed up separately — encrypted documents are
unreadable without it.

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
- **Health Bridge stays summarized**: each profile connection points to its own private
  PostgreSQL schema. Hearth accepts `health_daily`, optional `health_samples`, or both;
  daily rows take precedence and raw samples are grouped by local day and metric. Routine
  Apple Health data is kept out of the clinical timeline, while source counts remain on
  rollups for transparent chart captions.

## Key directories

```
src/db/            schema (users, profiles, documents, extraction_jobs,
                   extracted_items, observations, observation_types,
                   clinical_reports, ai_context_logs, audit_logs), seed
src/lib/           auth, crypto (AES-GCM), filesystem storage
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

## MCP prescription ingest

For local folders of old prescription PDFs/scans, run the stdio MCP server with
`npm run mcp:hearth`. It lets an MCP client scan allowed folders, upload encrypted
documents, read file payloads for OCR/vision extraction, and submit structured draft
items back into the normal Hearth review workflow. See
`docs/mcp-prescription-ingest.md`.

## Roadmap (from SPEC.md)

- **Phase 2**: native iOS shell with Share Extension + HealthKit sync
- **Phase 3**: Android share intent + Health Connect
